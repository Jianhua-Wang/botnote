import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { workspaceSettings, type WorkspaceSettings } from "../db/schema.js";
import type { UpdateWorkspaceSettingsInput } from "./types.js";

export const WORKSPACE_SETTINGS_ID = "default";
export const DEFAULT_WORKSPACE_TIMEZONE = "UTC";

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getWorkspaceSettings(
  db: Database["db"]
): Promise<WorkspaceSettings> {
  const [existing] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, WORKSPACE_SETTINGS_ID))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(workspaceSettings)
    .values({
      id: WORKSPACE_SETTINGS_ID,
      timezone: DEFAULT_WORKSPACE_TIMEZONE
    })
    .onConflictDoNothing();

  const [created] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, WORKSPACE_SETTINGS_ID))
    .limit(1);
  if (!created) throw new Error("workspace settings row missing after insert");
  return created;
}

export async function updateWorkspaceSettings(
  db: Database["db"],
  input: UpdateWorkspaceSettingsInput
): Promise<WorkspaceSettings> {
  const current = await getWorkspaceSettings(db);

  const timezone = input.timezone ?? current.timezone;
  if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
    throw new Error(`Invalid IANA timezone: "${input.timezone}"`);
  }

  const [updated] = await db
    .update(workspaceSettings)
    .set({ timezone })
    .where(eq(workspaceSettings.id, WORKSPACE_SETTINGS_ID))
    .returning();
  if (!updated) throw new Error("workspace settings update returned no row");
  return updated;
}
