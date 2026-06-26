import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { entities, type Entity, type Project } from "../db/schema.js";
import { getProject } from "./projects.js";
import { DEFAULT_WORKSPACE_TIMEZONE, getWorkspaceSettings } from "./workspace_settings.js";
import type { OpeningBriefInput } from "./types.js";

export interface OpeningBrief {
  project: Project | null;
  agentsMd: string;
  pinnedNotes: Entity[];
  openTasks: Entity[];
  recent: Entity[];
  generatedAt: Date;
  timezone: string;
}

export async function openingBrief(
  db: Database["db"],
  input: OpeningBriefInput
): Promise<OpeningBrief> {
  const project = input.projectId ? await getProject(db, input.projectId) : null;

  const projectFilter = input.projectId
    ? eq(entities.projectId, input.projectId)
    : isNull(entities.projectId);

  const [settings, pinnedNotes, openTasks, recentRows] = await Promise.all([
    getWorkspaceSettings(db).catch(() => ({ timezone: DEFAULT_WORKSPACE_TIMEZONE })),
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
      .where(projectFilter)
      .orderBy(desc(entities.createdAt))
      .limit(input.recentLimit)
  ]);

  return {
    project,
    agentsMd: project?.agentsMd ?? "",
    pinnedNotes,
    openTasks,
    recent: recentRows,
    generatedAt: new Date(),
    timezone: settings.timezone
  };
}

function titleFor(e: Entity): string {
  if (e.title && e.title.trim()) return e.title;
  const firstLine = e.body.split("\n").find((l) => l.trim())?.trim() ?? "";
  if (firstLine) return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  return "(untitled)";
}

export function formatOpeningBrief(brief: OpeningBrief): string {
  const lines: string[] = [];
  if (brief.project) {
    lines.push(`# Project: ${brief.project.key} — ${brief.project.name}`);
  } else {
    lines.push(`# Workspace`);
  }
  lines.push("");
  // One-line temporal context so agents can resolve relative dates immediately.
  lines.push(`_Server time: ${brief.generatedAt.toISOString()} · timezone: ${brief.timezone}_`);
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
      lines.push(`### 📌 ${titleFor(n)}`);
      if (n.body.trim()) {
        lines.push(n.body.trim());
      }
      lines.push("");
    }
  }

  if (brief.openTasks.length) {
    lines.push(`## Open Tasks (${brief.openTasks.length})`);
    for (const t of brief.openTasks) {
      lines.push(`- [${t.id}] ${titleFor(t)}${t.tags.length ? ` [${t.tags.join(", ")}]` : ""}`);
    }
    lines.push("");
  }

  if (brief.recent.length) {
    lines.push(`## Recent Activity (${brief.recent.length})`);
    for (const r of brief.recent) {
      const when = r.createdAt.toISOString().slice(0, 16).replace("T", " ");
      lines.push(`- ${when} · ${r.kind}/${r.id} · ${titleFor(r)}`);
    }
    lines.push("");
  }

  lines.push(`_Generated at ${brief.generatedAt.toISOString()}_`);
  return lines.join("\n");
}
