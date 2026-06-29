import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role data access for WebAuthn credentials. Writes only happen after the
 * route handlers have verified an attestation/assertion against a server-issued
 * challenge, so these helpers stay deliberately thin.
 */

export type StoredCredential = {
  id: string; // credential_id, base64url
  publicKey: string; // base64url COSE key
  counter: number;
  transports: string[] | null;
};

export async function listCredentialsByUser(
  userId: string,
): Promise<StoredCredential[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("webauthn_credentials")
    .select("credential_id, public_key, counter, transports")
    .eq("user_id", userId);
  return (data ?? []).map((r) => ({
    id: r.credential_id,
    publicKey: r.public_key,
    counter: Number(r.counter),
    transports: r.transports,
  }));
}

export async function getCredentialById(
  credentialId: string,
): Promise<(StoredCredential & { userId: string }) | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("webauthn_credentials")
    .select("user_id, credential_id, public_key, counter, transports")
    .eq("credential_id", credentialId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id,
    id: data.credential_id,
    publicKey: data.public_key,
    counter: Number(data.counter),
    transports: data.transports,
  };
}

export async function insertCredential(input: {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  deviceLabel?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("webauthn_credentials").insert({
    user_id: input.userId,
    credential_id: input.credentialId,
    public_key: input.publicKey,
    counter: input.counter,
    transports: input.transports,
    device_label: input.deviceLabel ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function bumpCredential(
  credentialId: string,
  counter: number,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("webauthn_credentials")
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq("credential_id", credentialId);
}
