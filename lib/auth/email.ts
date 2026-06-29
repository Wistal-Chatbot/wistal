import "server-only";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@wistal-stal.pl";
const FROM = `Wistal <${FROM_EMAIL}>`;

function otpEmailHtml(code: string): string {
  return `
  <div style="font-family: 'IBM Plex Sans', -apple-system, Segoe UI, Roboto, sans-serif; background-color: #eaecf0; padding: 32px;">
    <div style="max-width: 440px; margin: 0 auto; background: #ffffff; border: 1px solid #d3d8e0; border-radius: 8px; padding: 32px;">
      <h1 style="color: #1E2188; font-size: 20px; margin: 0 0 16px;">Wistal — kod logowania</h1>
      <p style="color: #1d2733; font-size: 14px; margin: 0 0 24px;">Twój jednorazowy kod logowania:</p>
      <p style="font-family: 'IBM Plex Mono', monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #1E2188; margin: 0 0 24px;">${code}</p>
      <p style="color: #58616e; font-size: 13px; margin: 0;">Kod wygasa za 10 minut. Jeśli to nie Ty próbowałeś się zalogować, zignoruj tę wiadomość.</p>
    </div>
  </div>`;
}

/** Send the OTP code to a staff email via Resend. */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  // In development, surface the code in the server log so the flow can be tested
  // without a verified sending domain.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[auth] OTP for ${email}: ${code}`);
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Twój kod logowania do Wistal",
    html: otpEmailHtml(code),
  });

  if (error) {
    console.error("[auth] Resend send failed", error);
    // In development the code is already logged above, so let the flow continue
    // even without a verified sending domain. In production a failed send is fatal.
    if (process.env.NODE_ENV === "production") {
      throw new Error("Failed to send OTP email");
    }
  }
}
