import { createHash, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { tokens, type Token } from "../db/schema.js";

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
  db: Database["db"],
  input: { name: string }
): Promise<CreatedToken> {
  const plaintext = `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
  const tokenHash = sha256(plaintext);
  const prefix = plaintext.slice(0, 11); // bn_ + first 8 hex
  const [row] = await db
    .insert(tokens)
    .values({ name: input.name, tokenHash, prefix, plaintext })
    .returning();
  if (!row) throw new Error("token insert returned no row");
  return { token: row, plaintext };
}

export async function listTokens(db: Database["db"]): Promise<Token[]> {
  return db.select().from(tokens).orderBy(desc(tokens.createdAt));
}

export async function revokeToken(db: Database["db"], id: string): Promise<boolean> {
  const res = await db.delete(tokens).where(eq(tokens.id, id)).returning({ id: tokens.id });
  return res.length > 0;
}

/**
 * Look up a token by its plaintext. Returns null if not found.
 * Bumps last_used_at on success. Not currently called by middleware; reserved
 * for when auth enforcement is enabled.
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
