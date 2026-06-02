import { inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { entities as entitiesTable, type Entity } from "../db/schema.js";
import type { SearchInput } from "./types.js";

export interface SearchHit {
  entity: Entity;
  score: number;
  components: {
    bm25?: number;
    cosine?: number;
    timeDecay?: number;
  };
}

const RRF_K = 60;
const KIND_WEIGHTS: Record<string, number> = {
  decision: 0.3,
  memory: 0.1,
  task: 0.05,
  comment: -0.1,
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
  const fetchN = Math.max(input.limit * 4, 40);

  const bm25Rows = (
    await db.execute<RankRow>(sql`
      SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(body_tsv, q) DESC) AS rank_pos
      FROM entities, websearch_to_tsquery('simple', ${input.query}) q
      WHERE body_tsv @@ q ${projectFilter} ${kindFilter}
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
            ${projectFilter} ${kindFilter}
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
        WHERE body_vec IS NOT NULL ${projectFilter} ${kindFilter}
        ORDER BY body_vec <=> ${vecLiteral}::vector
        LIMIT ${fetchN}
      `)
    ).rows;
  }

  const timeRows = (
    await db.execute<RankRow>(sql`
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rank_pos
      FROM entities
      WHERE 1=1 ${projectFilter} ${kindFilter}
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

  const hits: SearchHit[] = [];
  for (const id of idArr) {
    const entity = entityMap.get(id);
    if (!entity) continue;
    const bm25 = rrfScore(bm25Map.get(id));
    const cosine = rrfScore(vecMap.get(id));
    const timeDecay = rrfScore(timeMap.get(id)) * 0.3;
    const kindWeight = KIND_WEIGHTS[entity.kind] ?? 0;
    const score = bm25 + cosine + timeDecay + kindWeight * 0.01;
    hits.push({
      entity,
      score,
      components: {
        bm25: bm25 || undefined,
        cosine: cosine || undefined,
        timeDecay: timeDecay || undefined
      }
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, input.limit);
}
