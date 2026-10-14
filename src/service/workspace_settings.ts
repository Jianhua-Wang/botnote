import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { workspaceSettings, type WorkspaceSettings } from "../db/schema.js";
import type { Scope } from "./scope.js";
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

function rowFilter(scope: Scope) {
  return and(
    eq(workspaceSettings.id, WORKSPACE_SETTINGS_ID),
    eq(workspaceSettings.workspaceId, scope.workspaceId)
  );
}

export async function getWorkspaceSettings(
  scope: Scope,
  db: Database["db"]
): Promise<WorkspaceSettings> {
  const [existing] = await db.select().from(workspaceSettings).where(rowFilter(scope)).limit(1);
  if (existing) return existing;

  await db
    .insert(workspaceSettings)
    .values({
      id: WORKSPACE_SETTINGS_ID,
      workspaceId: scope.workspaceId,
      timezone: DEFAULT_WORKSPACE_TIMEZONE
    })
    .onConflictDoNothing();

  const [created] = await db.select().from(workspaceSettings).where(rowFilter(scope)).limit(1);
  if (!created) throw new Error("workspace settings row missing after insert");
  return created;
}

export async function updateWorkspaceSettings(
  scope: Scope,
  db: Database["db"],
  input: UpdateWorkspaceSettingsInput
): Promise<WorkspaceSettings> {
  const current = await getWorkspaceSettings(scope, db);

  const timezone = input.timezone ?? current.timezone;
  if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
    throw new Error(`Invalid IANA timezone: "${input.timezone}"`);
  }

  const [updated] = await db
    .update(workspaceSettings)
    .set({ timezone })
    .where(rowFilter(scope))
    .returning();
  if (!updated) throw new Error("workspace settings update returned no row");
  return updated;
}
