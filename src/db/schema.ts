import { sql } from "drizzle-orm";
import {
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const VECTOR_DIMENSIONS = 384;

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${VECTOR_DIMENSIONS})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
    if (!trimmed) return [];
    return trimmed.split(",").map((s) => Number(s));
  }
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  }
});

export const ENTITY_KINDS = [
  "task",
  "note",
  "decision",
  "doc",
  "comment",
  "log",
  "memory"
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ACTOR_KINDS = ["human", "agent", "system"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const EDGE_KINDS = [
  "blocks",
  "references",
  "supersedes",
  "derives_from",
  "replied_to",
  "parent_of"
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    agentsMd: text("agents_md").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    keyIdx: uniqueIndex("projects_key_idx").on(t.key)
  })
);

export const actors = pgTable(
  "actors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    key: text("key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    nameIdx: uniqueIndex("actors_name_idx").on(t.name),
    keyIdx: uniqueIndex("actors_key_idx").on(t.key)
  })
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text("status").notNull().default("open"),
    actorId: uuid("actor_id").references(() => actors.id),
    actorKind: text("actor_kind").notNull().default("human"),
    idempotencyKey: text("idempotency_key"),
    parentId: uuid("parent_id"),
    bodyTsv: tsvector("body_tsv"),
    bodyVec: vector("body_vec"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    projectCreatedIdx: index("entities_project_created_idx").on(t.projectId, t.createdAt),
    projectKindCreatedIdx: index("entities_project_kind_created_idx").on(
      t.projectId,
      t.kind,
      t.createdAt
    ),
    actorCreatedIdx: index("entities_actor_created_idx").on(t.actorId, t.createdAt),
    idempotencyIdx: uniqueIndex("entities_idempotency_idx").on(t.idempotencyKey)
  })
);

export const edges = pgTable(
  "edges",
  {
    fromId: uuid("from_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.fromId, t.toId, t.kind] }),
    toIdx: index("edges_to_idx").on(t.toId, t.kind),
    fromIdx: index("edges_from_idx").on(t.fromId, t.kind)
  })
);

export type Project = typeof projects.$inferSelect;
export type Actor = typeof actors.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type Edge = typeof edges.$inferSelect;
