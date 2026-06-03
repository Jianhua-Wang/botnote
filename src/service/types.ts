import { z } from "zod";
import { ACTOR_KINDS, EDGE_KINDS, ENTITY_KINDS } from "../db/schema.js";

export const EntityKindEnum = z.enum(ENTITY_KINDS);
export const ActorKindEnum = z.enum(ACTOR_KINDS);
export const EdgeKindEnum = z.enum(EDGE_KINDS);

export const Uuid = z.string().uuid();

export const WriteInput = z.object({
  kind: EntityKindEnum,
  projectId: Uuid.nullish(),
  title: z.string().min(1).max(500),
  body: z.string().default(""),
  tags: z.array(z.string()).default([]),
  status: z.string().default("open"),
  parentId: Uuid.nullish(),
  actorId: Uuid.nullish(),
  actorKind: ActorKindEnum.default("human"),
  metadata: z.record(z.unknown()).default({}),
  dueAt: z.coerce.date().nullish(),
  idempotencyKey: z.string().min(1).max(200).nullish()
});
export type WriteInput = z.infer<typeof WriteInput>;

export const UpdateInput = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  dueAt: z.coerce.date().nullable().optional()
});
export type UpdateInput = z.infer<typeof UpdateInput>;

export const SearchInput = z.object({
  query: z.string().min(1),
  projectId: Uuid.nullish(),
  kind: EntityKindEnum.nullish(),
  limit: z.number().int().min(1).max(100).default(10)
});
export type SearchInput = z.infer<typeof SearchInput>;

export const RecentInput = z.object({
  projectId: Uuid.nullish(),
  since: z.coerce.date().nullish(),
  kinds: z.array(EntityKindEnum).nullish(),
  limit: z.number().int().min(1).max(100).default(20)
});
export type RecentInput = z.infer<typeof RecentInput>;

export const TasksRangeInput = z.object({
  from: z.coerce.date().nullish(),
  to: z.coerce.date().nullish(),
  projectIds: z.array(Uuid).nullish(),
  includeBacklog: z.boolean().default(true),
  includeDone: z.boolean().default(false)
});
export type TasksRangeInput = z.infer<typeof TasksRangeInput>;

export const LinkInput = z.object({
  fromId: Uuid,
  toId: Uuid,
  kind: EdgeKindEnum
});
export type LinkInput = z.infer<typeof LinkInput>;

export const OpeningBriefInput = z.object({
  projectId: Uuid.nullish(),
  recentLimit: z.number().int().min(1).max(50).default(10)
});
export type OpeningBriefInput = z.infer<typeof OpeningBriefInput>;

export const CreateProjectInput = z.object({
  key: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().min(1).max(200),
  agentsMd: z.string().default("")
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const SetAgentsMdInput = z.object({
  projectId: Uuid,
  agentsMd: z.string()
});
export type SetAgentsMdInput = z.infer<typeof SetAgentsMdInput>;

export const EnsureActorInput = z.object({
  name: z.string().min(1).max(200),
  kind: ActorKindEnum,
  key: z.string().min(1).max(100).nullish()
});
export type EnsureActorInput = z.infer<typeof EnsureActorInput>;
