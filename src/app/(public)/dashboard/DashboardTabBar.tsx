"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ShoppingBag,
  Wallet,
  User,
  Package,
  Banknote,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import type { DashMode } from "@/lib/dashboard/mode";

type Tab = { href: string; label: string; icon: LucideIcon };

const TABS: Record<DashMode, Tab[]> = {
  buyer: [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/dashboard/orders", label: "Orders", icon: ShoppingBag },
    { href: "/dashboard/payments", label: "Payments", icon: Wallet },
    { href: "/dashboard/profile", label: "Profile", icon: User },
  ],
  seller: [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/dashboard/orders", label: "Orders", icon: Package },
    { href: "/dashboard/payouts", label: "Payouts", icon: Banknote },
    { href: "/dashboard/more", label: "More", icon: LayoutGrid },
  ],
};

export default function DashboardTabBar({ mode }: { mode: DashMode }) {
  const pathname = usePathname();
  const tabs = TABS[mode];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((t) => {
          const active =
            t.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === t.href || pathname.startsWith(`${t.href}/`);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-brand-700" : "text-black/45 hover:text-black/70"
              }`}
            >
              <Icon className={`size-5 ${active ? "" : "opacity-80"}`} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
