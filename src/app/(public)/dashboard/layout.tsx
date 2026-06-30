import { redirect } from "next/navigation";
import { getCapabilities, hasNoCapability } from "@/lib/profiles/capabilities";
import { resolveMode, rolesOf } from "@/lib/dashboard/mode";
import { setDashboardModeAction } from "@/app/(public)/dashboard/actions";
import DashboardTabBar from "@/app/(public)/dashboard/DashboardTabBar";

export const dynamic = "force-dynamic";

/**
 * Shell for the approved buyer/seller app: a persistent bottom tab bar, plus a
 * buyer/seller mode switch for dual-role accounts. Auth + routing gates live
 * here so every tab inherits them.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.staffRole) redirect("/operator");
  if (hasNoCapability(caps)) redirect("/onboarding");

  const mode = await resolveMode(caps);
  const { both } = rolesOf(caps);

  return (
    <div className="space-y-6 pb-24">
      {both ? (
        <div className="flex justify-center">
          <div className="inline-flex gap-1 rounded-full bg-black/[0.04] p-1 text-xs font-medium">
            {(["buyer", "seller"] as const).map((m) => (
              <form key={m} action={setDashboardModeAction}>
                <input type="hidden" name="mode" value={m} />
                <button
                  type="submit"
                  className={`rounded-full px-4 py-1.5 transition-colors ${
                    mode === m
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-black/50 hover:text-black/70"
                  }`}
                >
                  {m === "buyer" ? "Buying" : "Selling"}
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}

      {children}

      <DashboardTabBar mode={mode} />
    </div>
  );
}
