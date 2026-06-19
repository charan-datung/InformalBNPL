import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit/log";
import { CONFIG_DEFAULTS, type ConfigKey } from "@/lib/config/system-config";

/**
 * Update a single system_config value (admin action). Records the change in the
 * unified audit log with the previous and new values. Only known config keys
 * are accepted.
 */
export async function updateSystemConfig(input: {
  key: ConfigKey;
  value: number;
  actorUserId: string;
}): Promise<void> {
  if (!(input.key in CONFIG_DEFAULTS)) {
    throw new Error(`Unknown config key: ${input.key}`);
  }
  if (!Number.isFinite(input.value)) {
    throw new Error("Config value must be a number.");
  }

  const admin = createAdminClient();

  const { data: old } = await admin
    .from("system_config")
    .select("value")
    .eq("key", input.key)
    .maybeSingle();

  const { error } = await admin.from("system_config").upsert(
    {
      key: input.key,
      value: input.value as never,
      updated_by: input.actorUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);

  await recordAudit(admin, {
    actorUserId: input.actorUserId,
    action: "config_updated",
    entityType: "system_config",
    entityId: input.key,
    detail: { from: old?.value ?? null, to: input.value },
  });
}
