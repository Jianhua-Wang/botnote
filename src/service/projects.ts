import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { projects, type Project } from "../db/schema.js";
import type { CreateProjectInput, SetAgentsMdInput } from "./types.js";

export async function createProject(
  db: Database["db"],
  input: CreateProjectInput
): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({ key: input.key, name: input.name, agentsMd: input.agentsMd })
    .returning();
  if (!row) throw new Error("project insert returned no row");
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

export async function getAgentsMd(db: Database["db"], projectId: string): Promise<string> {
  const project = await getProject(db, projectId);
  return project?.agentsMd ?? "";
}

export async function setAgentsMd(
  db: Database["db"],
  input: SetAgentsMdInput
): Promise<Project> {
  const [row] = await db
    .update(projects)
    .set({ agentsMd: input.agentsMd })
    .where(eq(projects.id, input.projectId))
    .returning();
  if (!row) throw new Error(`project ${input.projectId} not found`);
  return row;
}
