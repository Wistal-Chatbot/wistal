import { z } from "zod";

import { isAllowedLoginEmail, normalizeEmail } from "@/lib/auth/domain";
import { verifyOtp } from "@/lib/auth/otp";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/auth/request";
import { setSessionCookie, signToken } from "@/lib/auth/session";
import { loginUser } from "@/lib/auth/users";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Podaj adres e-mail i 6-cyfrowy kod." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isAllowedLoginEmail(email)) {
    return Response.json(
      { error: "Dozwolone są tylko adresy @wistal.com.pl." },
      { status: 400 },
    );
  }

  // Cap verification attempts per IP+email to slow brute force across codes.
  const limit = await checkRateLimit({
    namespace: "otp:verify",
    key: `${getClientIp(request)}:${email}`,
    limit: 10,
    windowSeconds: 10 * 60,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Zbyt wiele prób. Spróbuj ponownie później." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const result = await verifyOtp(email, parsed.data.code);
  if (!result.ok) {
    return Response.json(
      { error: "Nieprawidłowy lub wygasły kod." },
      { status: 400 },
    );
  }

  const user = await loginUser(email);
  if (!user.isActive) {
    return Response.json(
      { error: "Konto jest nieaktywne. Skontaktuj się z administratorem." },
      { status: 403 },
    );
  }

  const token = await signToken({
    sub: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
  });
  await setSessionCookie(token);

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
    },
  });
}
