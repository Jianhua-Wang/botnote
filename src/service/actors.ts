import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { actors, type Actor } from "../db/schema.js";
import type { EnsureActorInput } from "./types.js";

export async function ensureActor(
  db: Database["db"],
  input: EnsureActorInput
): Promise<Actor> {
  if (input.key) {
    const byKey = await db.select().from(actors).where(eq(actors.key, input.key)).limit(1);
    if (byKey[0]) return byKey[0];
  }
  const byName = await db.select().from(actors).where(eq(actors.name, input.name)).limit(1);
  if (byName[0]) return byName[0];

  const [row] = await db
    .insert(actors)
    .values({ name: input.name, kind: input.kind, key: input.key ?? null })
    .returning();
  if (!row) throw new Error("actor insert returned no row");
  return row;
}

export async function getActor(db: Database["db"], id: string): Promise<Actor | null> {
  const rows = await db.select().from(actors).where(eq(actors.id, id)).limit(1);
  return rows[0] ?? null;
}
