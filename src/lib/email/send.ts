import "server-only";
import nodemailer from "nodemailer";

/**
 * Transactional email via SMTP (Office 365). Auth/confirmation emails are sent by
 * Supabase; this is for app-driven mail (e.g. approval notices). Best-effort:
 * never throws, never blocks the caller — a send failure is logged and returned.
 *
 * Configure via env (set on the host):
 *   SMTP_HOST   (default smtp.office365.com)
 *   SMTP_PORT   (default 587)
 *   SMTP_USER   e.g. sales@datung.io        ← required
 *   SMTP_PASS   the mailbox/app password     ← required
 *   EMAIL_FROM  (default "Datung <SMTP_USER>")
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) {
    console.warn("sendEmail skipped: SMTP not configured (set SMTP_USER/SMTP_PASS)");
    return { ok: false, error: "SMTP not configured" };
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.office365.com",
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  const from = process.env.EMAIL_FROM ?? `Datung <${process.env.SMTP_USER}>`;
  try {
    await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "send failed";
    console.error("sendEmail failed:", error);
    return { ok: false, error };
  }
}
