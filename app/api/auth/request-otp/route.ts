import { z } from "zod";

import { isWistalEmail, normalizeEmail } from "@/lib/auth/domain";
import { sendOtpEmail } from "@/lib/auth/email";
import { generateOtpCode, storeOtp } from "@/lib/auth/otp";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/auth/request";

const bodySchema = z.object({ email: z.string().email() });

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
      { error: "Podaj prawidłowy adres e-mail." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isWistalEmail(email)) {
    return Response.json(
      { error: "Dozwolone są tylko adresy @wistal.com.pl." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);
  const [byEmail, byIp] = await Promise.all([
    checkRateLimit({
      namespace: "otp:email",
      key: email,
      limit: 5,
      windowSeconds: 10 * 60,
    }),
    checkRateLimit({
      namespace: "otp:ip",
      key: ip,
      limit: 10,
      windowSeconds: 10 * 60,
    }),
  ]);

  const limited = !byEmail.allowed ? byEmail : !byIp.allowed ? byIp : null;
  if (limited) {
    return Response.json(
      { error: "Zbyt wiele prób. Spróbuj ponownie później." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  const code = generateOtpCode();
  await storeOtp(email, code);
  await sendOtpEmail(email, code);

  // Neutral response — never reveal whether the account exists.
  return Response.json({ ok: true });
}
