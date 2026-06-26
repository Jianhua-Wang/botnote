import { eq, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { projects, type Project } from "../db/schema.js";
import type { CreateProjectInput, ListProjectsInput, UpdateProjectInput } from "./types.js";

export async function createProject(
  db: Database["db"],
  input: CreateProjectInput
): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
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
  const [row] = await db.update(projects).set(set).where(eq(projects.id, id)).returning();
  if (!row) throw new Error(`project ${id} not found`);
  return row;
}

export async function getProjectByKey(
  db: Database["db"],
  key: string
): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.key, key)).limit(1);
  return rows[0] ?? null;
}

export async function getProject(db: Database["db"], id: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listProjects(
  db: Database["db"],
  input: ListProjectsInput = { includeArchived: false }
): Promise<Project[]> {
  if (input.includeArchived) {
    return db.select().from(projects).orderBy(projects.key);
  }
  return db.select().from(projects).where(ne(projects.status, "archived")).orderBy(projects.key);
}
