import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Always render fresh — this is a liveness/readiness check, not a cached page.
export const dynamic = "force-dynamic";

type Check = { label: string; ok: boolean; detail: string };

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = hasUrl && hasAnon;

  checks.push({
    label: "Supabase env configured",
    ok: configured,
    detail: configured
      ? "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set"
      : "Missing one or both public Supabase env vars (see .env.example)",
  });

  if (configured) {
    try {
      const supabase = await createClient();
      // Lightweight call that exercises the Auth endpoint without needing a
      // logged-in user. A network/credential failure throws or returns error.
      const { error } = await supabase.auth.getUser();
      const reachable = !error || error.name === "AuthSessionMissingError";
      checks.push({
        label: "Supabase Auth reachable",
        ok: reachable,
        detail: reachable
          ? "Auth endpoint responded"
          : `Auth error: ${error?.message ?? "unknown"}`,
      });
    } catch (e) {
      checks.push({
        label: "Supabase Auth reachable",
        ok: false,
        detail: e instanceof Error ? e.message : "Request failed",
      });
    }
  }

  return checks;
}

export default async function HealthPage() {
  const checks = await runChecks();
  const allOk = checks.every((c) => c.ok);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              allOk ? "bg-green-500" : "bg-amber-500"
            }`}
          />
          <h1 className="text-2xl font-semibold">
            Health: {allOk ? "ok" : "degraded"}
          </h1>
        </div>

        <p className="text-sm text-black/60 dark:text-white/60">
          Generated at {new Date().toISOString()}
        </p>

        <ul className="space-y-3">
          {checks.map((c) => (
            <li
              key={c.label}
              className="rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.label}</span>
                <span
                  className={`text-sm font-medium ${
                    c.ok ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {c.ok ? "pass" : "fail"}
                </span>
              </div>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                {c.detail}
              </p>
            </li>
          ))}
        </ul>

        <Link className="text-sm underline underline-offset-4" href="/">
          ← Back to public app
        </Link>
      </div>
    </main>
  );
}
