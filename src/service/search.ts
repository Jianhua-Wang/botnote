import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { edges, entities as entitiesTable, type Entity } from "../db/schema.js";
import type { SearchInput } from "./types.js";

export interface SearchHit {
  entity: Entity;
  score: number;
  components: {
    bm25?: number;
    cosine?: number;
    timeDecay?: number;
    accessBoost?: number;
  };
  /** True when another entity supersedes this one (score multiplied down). */
  superseded?: boolean;
}

const RRF_K = 60;
// Entities that are the target of a 'supersedes' edge keep showing up in
// results (history stays reachable) but far below their replacement.
const SUPERSEDED_MULTIPLIER = 0.3;
// Light frequency boost: log-scaled, capped well below one RRF rank step at
// the top of the list so access count breaks ties rather than beating relevance.
function accessBoostFor(accessCount: number): number {
  return Math.min(Math.log1p(accessCount) * 0.0015, 0.005);
}
const KIND_WEIGHTS: Record<string, number> = {
  decision: 0.3,
  memory: 0.1,
  task: 0.05,
  comment: -0.1,
  feedback: -0.1,
  log: -0.2
};

function rrfScore(rank: number | undefined): number {
  if (rank == null) return 0;
  return 1 / (RRF_K + rank);
}

type RankRow = { id: string; rank_pos: number } & Record<string, unknown>;

export async function search(
  db: Database["db"],
  input: SearchInput,
  opts: { queryEmbedding?: number[] } = {}
): Promise<SearchHit[]> {
  const projectFilter = input.projectId
    ? sql`AND project_id = ${input.projectId}::uuid`
    : sql``;
  const kindFilter = input.kind ? sql`AND kind = ${input.kind}` : sql``;
  const activeProjectFilter = input.projectId
    ? sql``
    : sql`AND (project_id IS NULL OR project_id IN (
        SELECT id FROM projects WHERE status <> 'archived'
      ))`;
  const notTrashed = sql`AND deleted_at IS NULL`;
  const fetchN = Math.max(input.limit * 4, 40);

  const bm25Rows = (
    await db.execute<RankRow>(sql`
      SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(body_tsv, q) DESC) AS rank_pos
      FROM entities, websearch_to_tsquery('simple', ${input.query}) q
      WHERE body_tsv @@ q ${projectFilter} ${kindFilter} ${activeProjectFilter} ${notTrashed}
      ORDER BY ts_rank_cd(body_tsv, q) DESC
      LIMIT ${fetchN}
    `)
  ).rows;

  const ilikeFallback = bm25Rows.length === 0
    ? (
        await db.execute<RankRow>(sql`
          SELECT id,
                 ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rank_pos
          FROM entities
          WHERE (title ILIKE ${`%${input.query}%`} OR body ILIKE ${`%${input.query}%`})
            ${projectFilter} ${kindFilter} ${activeProjectFilter} ${notTrashed}
          LIMIT ${fetchN}
        `)
      ).rows
    : [];

  let vecRows: RankRow[] = [];
  if (opts.queryEmbedding && opts.queryEmbedding.length > 0) {
    const vecLiteral = `[${opts.queryEmbedding.join(",")}]`;
    vecRows = (
      await db.execute<RankRow>(sql`
        SELECT id, ROW_NUMBER() OVER (ORDER BY body_vec <=> ${vecLiteral}::vector) AS rank_pos
        FROM entities
        WHERE body_vec IS NOT NULL ${projectFilter} ${kindFilter} ${activeProjectFilter} ${notTrashed}
        ORDER BY body_vec <=> ${vecLiteral}::vector
        LIMIT ${fetchN}
      `)
    ).rows;
  }

  const timeRows = (
    await db.execute<RankRow>(sql`
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rank_pos
      FROM entities
      WHERE 1=1 ${projectFilter} ${kindFilter} ${activeProjectFilter} ${notTrashed}
      ORDER BY created_at DESC
      LIMIT ${fetchN}
    `)
  ).rows;

  const bm25Map = new Map<string, number>();
  for (const r of bm25Rows.length > 0 ? bm25Rows : ilikeFallback) {
    bm25Map.set(r.id, Number(r.rank_pos));
  }
  const vecMap = new Map<string, number>();
  for (const r of vecRows) vecMap.set(r.id, Number(r.rank_pos));
  const timeMap = new Map<string, number>();
  for (const r of timeRows) timeMap.set(r.id, Number(r.rank_pos));

  const ids = new Set<string>([...bm25Map.keys(), ...vecMap.keys()]);
  if (ids.size === 0) return [];

  const idArr = [...ids];
  const entitiesRows = await db
    .select()
    .from(entitiesTable)
    .where(inArray(entitiesTable.id, idArr));
  const entityMap = new Map<string, Entity>();
  for (const r of entitiesRows) entityMap.set(r.id, r);

  const supersededRows = await db
    .select({ toId: edges.toId })
    .from(edges)
    .where(and(eq(edges.kind, "supersedes"), inArray(edges.toId, idArr)));
  const supersededIds = new Set(supersededRows.map((r) => r.toId));

  const hits: SearchHit[] = [];
  for (const id of idArr) {
    const entity = entityMap.get(id);
    if (!entity) continue;
    const bm25 = rrfScore(bm25Map.get(id));
    const cosine = rrfScore(vecMap.get(id));
    const timeDecay = rrfScore(timeMap.get(id)) * 0.3;
    const kindWeight = KIND_WEIGHTS[entity.kind] ?? 0;
    const accessBoost = accessBoostFor(entity.accessCount);
    const superseded = supersededIds.has(id);
    let score = bm25 + cosine + timeDecay + kindWeight * 0.01 + accessBoost;
    if (superseded) score *= SUPERSEDED_MULTIPLIER;
    hits.push({
      entity,
      score,
      components: {
        bm25: bm25 || undefined,
        cosine: cosine || undefined,
        timeDecay: timeDecay || undefined,
        accessBoost: accessBoost || undefined
      },
      ...(superseded ? { superseded: true } : {})
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, input.limit);
}

// A hit must be near the top of at least one modality to count as a
// near-duplicate hint (bm25 rank-1 alone ≈ 1/61 ≈ 0.016).
const SIMILAR_MIN_SCORE = 0.015;

/**
 * Near-duplicate candidates for a freshly written note, used by `remember`
 * to hint the caller that a similar memory may already exist. Queries with
 * the note's label line (title or first body line) so tsquery stays short.
 */
export async function findSimilar(
  db: Database["db"],
  opts: {
    title?: string | null;
    body: string;
    projectId?: string | null;
    excludeId?: string;
    limit?: number;
    queryEmbedding?: number[];
  }
): Promise<SearchHit[]> {
  const label = (opts.title ?? opts.body.split("\n")[0] ?? "").trim().slice(0, 200);
  if (!label) return [];
  const limit = opts.limit ?? 3;
  const hits = await search(
    db,
    { query: label, projectId: opts.projectId ?? null, kind: "note", limit: limit + 1 },
    opts.queryEmbedding ? { queryEmbedding: opts.queryEmbedding } : {}
  );
  return hits
    .filter((h) => h.entity.id !== opts.excludeId && !h.superseded && h.score >= SIMILAR_MIN_SCORE)
    .slice(0, limit);
}
