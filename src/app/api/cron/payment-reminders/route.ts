import { NextResponse } from "next/server";
import { runPaymentReminders } from "@/lib/reminders/payment-reminders";

/**
 * Daily payment-reminder cron. Invoked by Vercel Cron (see vercel.json), which
 * sends `Authorization: Bearer $CRON_SECRET`. We require that secret so the
 * endpoint can't be triggered by the public. Returns a small JSON summary.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured → refuse (never run open)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runPaymentReminders();
  return NextResponse.json({ ok: true, ...result });
}

// Allow manual triggering with the same secret (e.g. curl) during setup.
export const POST = GET;
