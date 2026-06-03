import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { projects, type Project } from "../db/schema.js";
import type { CreateProjectInput, UpdateProjectInput } from "./types.js";

export async function createProject(
  db: Database["db"],
  input: CreateProjectInput
): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
      key: input.key,
      name: input.name,
      color: input.color,
      icon: input.icon,
      agentsMd: input.agentsMd
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

export async function listProjects(db: Database["db"]): Promise<Project[]> {
  return db.select().from(projects).orderBy(projects.key);
}

