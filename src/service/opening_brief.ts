import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { entities, type Entity, type Project } from "../db/schema.js";
import { getProject } from "./projects.js";
import type { OpeningBriefInput } from "./types.js";

export interface OpeningBrief {
  project: Project | null;
  agentsMd: string;
  pinnedNotes: Entity[];
  openTasks: Entity[];
  pendingDecisions: Entity[];
  recent: Entity[];
  generatedAt: Date;
}

export async function openingBrief(
  db: Database["db"],
  input: OpeningBriefInput
): Promise<OpeningBrief> {
  const project = input.projectId ? await getProject(db, input.projectId) : null;

  const projectFilter = input.projectId
    ? eq(entities.projectId, input.projectId)
    : isNull(entities.projectId);

  const [pinnedNotes, openTasks, pendingDecisions, recentRows] = await Promise.all([
    db
      .select()
      .from(entities)
      .where(and(projectFilter, eq(entities.pinned, true)))
      .orderBy(desc(entities.updatedAt))
      .limit(20),
    db
      .select()
      .from(entities)
      .where(and(projectFilter, eq(entities.kind, "task"), eq(entities.status, "open")))
      .orderBy(desc(entities.createdAt))
      .limit(20),
    db
      .select()
      .from(entities)
      .where(and(projectFilter, eq(entities.kind, "decision"), eq(entities.status, "open")))
      .orderBy(desc(entities.createdAt))
      .limit(10),
    db
      .select()
      .from(entities)
      .where(and(projectFilter, ne(entities.kind, "log")))
      .orderBy(desc(entities.createdAt))
      .limit(input.recentLimit)
  ]);

  return {
    project,
    agentsMd: project?.agentsMd ?? "",
    pinnedNotes,
    openTasks,
    pendingDecisions,
    recent: recentRows,
    generatedAt: new Date()
  };
}

export function formatOpeningBrief(brief: OpeningBrief): string {
  const lines: string[] = [];
  if (brief.project) {
    lines.push(`# Project: ${brief.project.key} — ${brief.project.name}`);
  } else {
    lines.push(`# Workspace`);
  }
  lines.push("");

  if (brief.agentsMd) {
    lines.push("## AGENTS.md");
    lines.push(brief.agentsMd.trim());
    lines.push("");
  }

  if (brief.pinnedNotes.length) {
    lines.push(`## Pinned Notes (${brief.pinnedNotes.length})`);
    lines.push("_These are pinned by the user as always-relevant context for this project. Read them before acting._");
    lines.push("");
    for (const n of brief.pinnedNotes) {
      lines.push(`### 📌 ${n.title}`);
      if (n.body.trim()) {
        lines.push(n.body.trim());
      }
      lines.push("");
    }
  }

  if (brief.openTasks.length) {
    lines.push(`## Open Tasks (${brief.openTasks.length})`);
    for (const t of brief.openTasks) {
      lines.push(`- [${t.id.slice(0, 8)}] ${t.title}${t.tags.length ? ` [${t.tags.join(", ")}]` : ""}`);
    }
    lines.push("");
  }

  if (brief.pendingDecisions.length) {
    lines.push(`## Pending Decisions (${brief.pendingDecisions.length})`);
    for (const d of brief.pendingDecisions) {
      lines.push(`- [${d.id.slice(0, 8)}] ${d.title}`);
    }
    lines.push("");
  }

  if (brief.recent.length) {
    lines.push(`## Recent Activity (${brief.recent.length})`);
    for (const r of brief.recent) {
      const when = r.createdAt.toISOString().slice(0, 16).replace("T", " ");
      lines.push(`- ${when} · ${r.kind} · ${r.title}`);
    }
    lines.push("");
  }

  lines.push(`_Generated at ${brief.generatedAt.toISOString()}_`);
  return lines.join("\n");
}
