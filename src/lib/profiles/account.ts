import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Read-side helpers for the account/profile section of the active dashboards.
 *
 * Identity always comes from the verified session (the caller passes their own
 * userId), so the service-role client only ever returns the caller's own rows.
 * These power the "Profile" section and the dashboard greeting.
 */

export type AccountProfile = {
  name: string;
  contact: string | null;
  email: string | null;
  /** users.created_at — "member since". */
  memberSince: string | null;
};

export async function getAccountProfile(
  userId: string,
  email: string | null,
): Promise<AccountProfile> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("name, contact, created_at")
    .eq("id", userId)
    .maybeSingle();

  return {
    name: data?.name ?? "",
    contact: data?.contact ?? null,
    email,
    memberSince: data?.created_at ?? null,
  };
}

export type BuyerProfileDetail = {
  creditLimitCentavos: number;
  kycStatus: string;
  buyerKind: string | null;
  activatedAt: string | null;
  memberSince: string | null;
};

export async function getBuyerProfileDetail(
  userId: string,
): Promise<BuyerProfileDetail> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("buyer_profiles")
    .select("credit_limit_centavos, kyc_status, buyer_kind, activated_at, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    creditLimitCentavos: data?.credit_limit_centavos ?? 0,
    kycStatus: data?.kyc_status ?? "pending",
    buyerKind: data?.buyer_kind ?? null,
    activatedAt: data?.activated_at ?? null,
    memberSince: data?.created_at ?? null,
  };
}

export type SellerProfileDetail = {
  socialHandle: string | null;
  marketplaceUrl: string | null;
  storefrontLocation: string | null;
  sellingSince: string | null;
  kycStatus: string;
  trustTier: string;
  rollingReservePct: number;
  activatedAt: string | null;
  memberSince: string | null;
};

export async function getSellerProfileDetail(
  userId: string,
): Promise<SellerProfileDetail> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("seller_profiles")
    .select(
      "social_handle, marketplace_url, storefront_location, selling_since, kyc_status, trust_tier, rolling_reserve_pct, activated_at, created_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  return {
    socialHandle: data?.social_handle ?? null,
    marketplaceUrl: data?.marketplace_url ?? null,
    storefrontLocation: data?.storefront_location ?? null,
    sellingSince: data?.selling_since ?? null,
    kycStatus: data?.kyc_status ?? "pending",
    trustTier: data?.trust_tier ?? "new",
    rollingReservePct: Number(data?.rolling_reserve_pct ?? 0),
    activatedAt: data?.activated_at ?? null,
    memberSince: data?.created_at ?? null,
  };
}
