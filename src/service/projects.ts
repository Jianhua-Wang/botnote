import { and, eq, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { projects, type Project } from "../db/schema.js";
import type { Scope } from "./scope.js";
import type { CreateProjectInput, ListProjectsInput, UpdateProjectInput } from "./types.js";

export async function createProject(
  scope: Scope,
  db: Database["db"],
  input: CreateProjectInput
): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
      workspaceId: scope.workspaceId,
      key: input.key,
      name: input.name,
      status: input.status,
      color: input.color,
      icon: input.icon,
      agentsMd: input.agentsMd,
      archivedAt: input.status === "archived" ? new Date() : null
    })
    .returning();
  if (!row) throw new Error("project insert returned no row");
  return row;
}

export async function updateProject(
  scope: Scope,
  db: Database["db"],
  id: string,
  input: UpdateProjectInput
): Promise<Project> {
  const set: Record<string, unknown> = { ...input, updatedAt: new Date() };
  if (input.status === "archived") {
    set.archivedAt = sql`COALESCE(${projects.archivedAt}, now())`;
  } else if (input.status !== undefined) {
    set.archivedAt = null;
  }
  const [row] = await db
    .update(projects)
    .set(set)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, scope.workspaceId)))
    .returning();
  if (!row) throw new Error(`project ${id} not found`);
  return row;
}

export async function getProjectByKey(
  scope: Scope,
  db: Database["db"],
  key: string
): Promise<Project | null> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.key, key), eq(projects.workspaceId, scope.workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProject(
  scope: Scope,
  db: Database["db"],
  id: string
): Promise<Project | null> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, scope.workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProjects(
  scope: Scope,
  db: Database["db"],
  input: ListProjectsInput = { includeArchived: false }
): Promise<Project[]> {
  const inScope = eq(projects.workspaceId, scope.workspaceId);
  const where = input.includeArchived ? inScope : and(inScope, ne(projects.status, "archived"));
  return db.select().from(projects).where(where).orderBy(projects.key);
}
