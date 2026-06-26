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

export const PROJECT_STATUSES = ["planned", "active", "watching", "paused", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    color: text("color").notNull().default("#5e6ad2"),
    icon: text("icon").notNull().default("circle"),
    agentsMd: text("agents_md").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
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

export const RECURRENCE_ANCHORS = ["scheduled", "completion"] as const;
export type RecurrenceAnchor = (typeof RECURRENCE_ANCHORS)[number];

export const RECURRENCE_EXCEPTION_ACTIONS = ["skipped", "cancelled", "modified"] as const;
export type RecurrenceExceptionAction = (typeof RECURRENCE_EXCEPTION_ACTIONS)[number];

export const recurrenceRules = pgTable(
  "recurrence_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    currentOccurrenceId: uuid("current_occurrence_id").references(() => entities.id, {
      onDelete: "set null"
    }),
    enabled: boolean("enabled").notNull().default(true),
    rrule: text("rrule").notNull(),
    dtstart: timestamp("dtstart", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    allDay: boolean("all_day").notNull().default(true),
    anchor: text("anchor").notNull().default("scheduled"),
    maxInstancesAhead: integer("max_instances_ahead").notNull().default(1),
    generatedCount: integer("generated_count").notNull().default(1),
    lastOccurrenceAt: timestamp("last_occurrence_at", { withTimezone: true }),
    nextOccurrenceAt: timestamp("next_occurrence_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    seriesIdx: uniqueIndex("recurrence_rules_series_idx").on(t.seriesId),
    currentOccurrenceIdx: index("recurrence_rules_current_occurrence_idx").on(
      t.currentOccurrenceId
    ),
    nextOccurrenceIdx: index("recurrence_rules_next_occurrence_idx").on(t.nextOccurrenceAt),
    enabledIdx: index("recurrence_rules_enabled_idx").on(t.enabled, t.nextOccurrenceAt)
  })
);

export const recurrenceExceptions = pgTable(
  "recurrence_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => recurrenceRules.id, { onDelete: "cascade" }),
    occurrenceAt: timestamp("occurrence_at", { withTimezone: true }).notNull(),
    action: text("action").notNull(),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    ruleOccurrenceIdx: index("recurrence_exceptions_rule_occurrence_idx").on(
      t.ruleId,
      t.occurrenceAt
    ),
    entityIdx: index("recurrence_exceptions_entity_idx").on(t.entityId)
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

export const embeddingSettings = pgTable("embedding_settings", {
  id: text("id").primaryKey().default("default"),
  enabled: boolean("enabled").notNull().default(true),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull().default("text-embedding-3-small"),
  baseUrl: text("base_url"),
  apiKey: text("api_key"),
  dimensions: integer("dimensions").notNull().default(VECTOR_DIMENSIONS),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const workspaceSettings = pgTable("workspace_settings", {
  id: text("id").primaryKey().default("default"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

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
export type RecurrenceRule = typeof recurrenceRules.$inferSelect;
export type RecurrenceException = typeof recurrenceExceptions.$inferSelect;
export type Token = typeof tokens.$inferSelect;
export type EmbeddingSettings = typeof embeddingSettings.$inferSelect;
export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;
export type Session = typeof sessions.$inferSelect;
