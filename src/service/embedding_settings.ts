import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  embeddingSettings,
  entities,
  VECTOR_DIMENSIONS,
  type EmbeddingSettings
} from "../db/schema.js";
import type { UpdateEmbeddingSettingsInput } from "./types.js";

export const DEFAULT_EMBEDDING_PROVIDER = "openai";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_SETTINGS_ID = "default";

export interface EmbeddingCoverage {
  totalCount: number;
  embeddedCount: number;
  missingCount: number;
}

function normalizeNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function previewSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) return "configured";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

export async function getEmbeddingSettings(
  db: Database["db"]
): Promise<EmbeddingSettings> {
  const [existing] = await db
    .select()
    .from(embeddingSettings)
    .where(eq(embeddingSettings.id, EMBEDDING_SETTINGS_ID))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(embeddingSettings)
    .values({
      id: EMBEDDING_SETTINGS_ID,
      enabled: true,
      provider: DEFAULT_EMBEDDING_PROVIDER,
      model: DEFAULT_EMBEDDING_MODEL,
      dimensions: VECTOR_DIMENSIONS
    })
    .onConflictDoNothing();

  const [created] = await db
    .select()
    .from(embeddingSettings)
    .where(eq(embeddingSettings.id, EMBEDDING_SETTINGS_ID))
    .limit(1);
  if (!created) throw new Error("embedding settings row missing after insert");
  return created;
}

export async function updateEmbeddingSettings(
  db: Database["db"],
  input: UpdateEmbeddingSettingsInput
): Promise<EmbeddingSettings> {
  const current = await getEmbeddingSettings(db);
  const apiKey = normalizeNullable(input.apiKey);
  const baseUrl = normalizeNullable(input.baseUrl);
  const set = {
    enabled: input.enabled ?? current.enabled,
    provider: input.provider ?? current.provider,
    model: input.model?.trim() || current.model,
    baseUrl: baseUrl === undefined ? current.baseUrl : baseUrl,
    apiKey: apiKey === undefined ? current.apiKey : apiKey,
    dimensions: VECTOR_DIMENSIONS
  };

  const [updated] = await db
    .update(embeddingSettings)
    .set(set)
    .where(eq(embeddingSettings.id, EMBEDDING_SETTINGS_ID))
    .returning();
  if (!updated) throw new Error("embedding settings update returned no row");
  return updated;
}

export async function embeddingCoverage(db: Database["db"]): Promise<EmbeddingCoverage> {
  const [row] = (
    await db.execute<{
      total_count: string | number;
      embedded_count: string | number;
      missing_count: string | number;
    }>(sql`
      SELECT
        count(*)::int AS total_count,
        count(body_vec)::int AS embedded_count,
        count(*) FILTER (WHERE body_vec IS NULL)::int AS missing_count
      FROM ${entities}
      WHERE kind IN ('task', 'note')
        AND length(trim(coalesce(title, '') || E'\n' || coalesce(body, ''))) > 0
    `)
  ).rows;

  return {
    totalCount: Number(row?.total_count ?? 0),
    embeddedCount: Number(row?.embedded_count ?? 0),
    missingCount: Number(row?.missing_count ?? 0)
  };
}
