import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { tokens, type Token } from "../db/schema.js";
import type { Scope } from "./scope.js";

const TOKEN_PREFIX = "bn_";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface CreatedToken {
  token: Token;
  /** The recoverable plaintext token. NULL only for tokens created before 0014. */
  plaintext: string;
}

export async function createToken(
  scope: Scope,
  db: Database["db"],
  input: { name: string }
): Promise<CreatedToken> {
  const plaintext = `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
  const tokenHash = sha256(plaintext);
  const prefix = plaintext.slice(0, 11); // bn_ + first 8 hex
  const [row] = await db
    .insert(tokens)
    .values({ workspaceId: scope.workspaceId, name: input.name, tokenHash, prefix, plaintext })
    .returning();
  if (!row) throw new Error("token insert returned no row");
  return { token: row, plaintext };
}

export async function listTokens(scope: Scope, db: Database["db"]): Promise<Token[]> {
  return db
    .select()
    .from(tokens)
    .where(eq(tokens.workspaceId, scope.workspaceId))
    .orderBy(desc(tokens.createdAt));
}

export async function revokeToken(scope: Scope, db: Database["db"], id: string): Promise<boolean> {
  const res = await db
    .delete(tokens)
    .where(and(eq(tokens.id, id), eq(tokens.workspaceId, scope.workspaceId)))
    .returning({ id: tokens.id });
  return res.length > 0;
}

/**
 * Look up a token by its plaintext. Returns null if not found. Bumps
 * last_used_at on success. Unscoped by design: the returned row's workspaceId
 * is what the transport turns into the request Scope.
 */
export async function consumeToken(
  db: Database["db"],
  plaintext: string
): Promise<Token | null> {
  const tokenHash = sha256(plaintext);
  const rows = await db.select().from(tokens).where(eq(tokens.tokenHash, tokenHash)).limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, row.id));
  return row;
}
