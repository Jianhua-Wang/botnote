import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
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

export const ENTITY_KINDS = ["task", "note"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ACTOR_KINDS = ["human", "agent", "system"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const EDGE_KINDS = ["blocks", "references", "parent_of"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#5e6ad2"),
    icon: text("icon").notNull().default("circle"),
    agentsMd: text("agents_md").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    keyIdx: uniqueIndex("projects_key_idx").on(t.key)
  })
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text("status").notNull().default("open"),
    actorKind: text("actor_kind").notNull().default("human"),
    idempotencyKey: text("idempotency_key"),
    parentId: uuid("parent_id"),
    bodyTsv: tsvector("body_tsv"),
    bodyVec: vector("body_vec"),
    metadata: jsonb("metadata").notNull().default({}),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: text("priority").notNull().default("none"),
    sequenceId: integer("sequence_id"),
    pinned: boolean("pinned").notNull().default(false),
    // Set automatically on a status transition into 'done', cleared on exit.
    // Drives the calendar's display-date logic: done tasks render on
    // completedAt rather than dueAt so the timeline reflects what actually
    // happened.
    completedAt: timestamp("completed_at", { withTimezone: true }),
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
    parentIdx: index("entities_parent_idx").on(t.parentId),
    completedAtIdx: index("entities_completed_at_idx").on(t.completedAt),
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

export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    plaintext: text("plaintext"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("tokens_token_hash_idx").on(t.tokenHash),
    createdIdx: index("tokens_created_idx").on(t.createdAt)
  })
);

// Browser-facing session cookies. The plaintext is stored in an httpOnly
// cookie; the row stores sha256(plaintext). On login the user posts the master
// password (env BOTNOTE_PASSWORD) and we mint a row + set the cookie.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    expiresIdx: index("sessions_expires_at_idx").on(t.expiresAt)
  })
);

export type Project = typeof projects.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type Edge = typeof edges.$inferSelect;
export type Token = typeof tokens.$inferSelect;
export type Session = typeof sessions.$inferSelect;
