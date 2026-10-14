import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { DEFAULT_WORKSPACE_ID, workspaces } from "../db/schema.js";

/**
 * The tenant boundary every service call runs under. Single-user builds use
 * DEFAULT_SCOPE for everything; the hosted build resolves it per request from
 * the token or session. Service functions take it as their first argument and
 * MUST filter every read and stamp every write with it.
 */
export interface Scope {
  workspaceId: string;
}

export const DEFAULT_SCOPE: Scope = Object.freeze({ workspaceId: DEFAULT_WORKSPACE_ID });

export function scopeFor(workspaceId: string): Scope {
  return { workspaceId };
}

/** Verify the default workspace row exists (migration 0028 seeds it). */
export async function resolveDefaultScope(db: Database["db"]): Promise<Scope> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, DEFAULT_WORKSPACE_ID))
    .limit(1);
  if (!rows[0]) {
    throw new Error(
      `default workspace ${DEFAULT_WORKSPACE_ID} missing; run migrations before starting the daemon`
    );
  }
  return DEFAULT_SCOPE;
}
