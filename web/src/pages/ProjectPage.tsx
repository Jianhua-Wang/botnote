import { ChevronDown, ChevronRight, FileText, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { useEntityList, useOpeningBrief, useProjectByKey } from "../api/hooks";
import type { EntityKind } from "../api/types";
import { KindBadge } from "../components/KindBadge";
import { useModals } from "../state/modals";

const TABS: Array<{ key: string; label: string; kinds: EntityKind[] | null }> = [
  { key: "all", label: "All", kinds: null },
  { key: "tasks", label: "Tasks", kinds: ["task"] },
  { key: "notes", label: "Notes", kinds: ["note"] },
  { key: "decisions", label: "Decisions", kinds: ["decision"] },
  { key: "memory", label: "Memory", kinds: ["memory"] },
  { key: "docs", label: "Docs", kinds: ["doc"] }
];

export function ProjectPage() {
  const { key } = useParams<{ key: string }>();
  const { data: project } = useProjectByKey(key);
  const { data: brief } = useOpeningBrief(project?.id, { poll: true });
  const [tab, setTab] = useState("all");
  const [briefOpen, setBriefOpen] = useState(true);
  const { open } = useModals();

  const tabDef = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const { data: entities } = useEntityList(project?.id, tabDef.kinds, { poll: true });

  const counts = useMemo(() => {
    const byKind: Record<string, number> = {};
    brief?.recent.forEach((e) => {
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    });
    return byKind;
  }, [brief?.recent]);

  if (!project) {
    return <div className="p-6 text-sm text-muted">Loading project…</div>;
  }

  return (
    <div className="h-full flex">
      <div className="w-[420px] shrink-0 border-r border-line bg-surface flex flex-col">
        <div className="px-4 pt-3 pb-2 border-b border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-accent">{project.key}</span>
              <span className="text-sm font-semibold text-ink truncate">{project.name}</span>
            </div>
            <Link
              to={`/p/${project.key}/agents-md`}
              className="btn btn-ghost"
              title="AGENTS.md"
            >
              <Settings2 size={13} />
            </Link>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xxs text-muted">
            <span>{brief?.openTasks.length ?? 0} open tasks</span>
            <span>·</span>
            <span>{brief?.pendingDecisions.length ?? 0} pending decisions</span>
            <span>·</span>
            <button
              className="text-accent hover:underline"
              onClick={() => open({ kind: "quick-create", projectId: project.id })}
            >
              + new
            </button>
          </div>
        </div>

        <div className="border-b border-line">
          <button
            className="w-full px-4 py-1.5 flex items-center justify-between text-xxs uppercase tracking-wider text-muted hover:bg-sidebar"
            onClick={() => setBriefOpen((v) => !v)}
          >
            <span>Opening brief</span>
            {briefOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {briefOpen && (
            <div className="px-4 pb-3 space-y-2 text-xs">
              {brief?.agentsMd ? (
                <div className="bg-amber-50 border border-amber-100 rounded p-2 max-h-32 overflow-y-auto scrollbar-thin">
                  <div className="font-mono text-xxs text-amber-900 whitespace-pre-wrap">
                    {brief.agentsMd}
                  </div>
                </div>
              ) : (
                <Link
                  to={`/p/${project.key}/agents-md`}
                  className="block text-xs text-muted hover:text-accent"
                >
                  No AGENTS.md set. Click to write one →
                </Link>
              )}
              {brief && brief.openTasks.length > 0 && (
                <div>
                  <div className="text-xxs uppercase tracking-wider text-muted mb-1">
                    Open tasks
                  </div>
                  <ul className="space-y-0.5">
                    {brief.openTasks.slice(0, 5).map((t) => (
                      <li key={t.id}>
                        <Link
                          to={`/p/${project.key}/e/${t.id}`}
                          className="text-ink hover:text-accent truncate block"
                        >
                          □ {t.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {brief && brief.pendingDecisions.length > 0 && (
                <div>
                  <div className="text-xxs uppercase tracking-wider text-muted mb-1">
                    Pending decisions
                  </div>
                  <ul className="space-y-0.5">
                    {brief.pendingDecisions.slice(0, 5).map((d) => (
                      <li key={d.id}>
                        <Link
                          to={`/p/${project.key}/e/${d.id}`}
                          className="text-ink hover:text-accent truncate block"
                        >
                          ◆ {d.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-xxs text-faint mt-1">
                refreshes every 30s · agent + you both write
              </div>
            </div>
          )}
        </div>

        <div className="flex border-b border-line bg-sidebar/30">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-xs py-1.5 ${
                tab === t.key
                  ? "border-b-2 border-accent text-ink font-medium -mb-px"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.kinds?.[0] && counts[t.kinds[0]] !== undefined && (
                <span className="ml-1 text-faint">{counts[t.kinds[0]]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {entities && entities.length === 0 && (
            <div className="p-6 text-center text-sm text-muted">
              No {tabDef.label.toLowerCase()} yet.
            </div>
          )}
          {entities?.map((e) => (
            <NavLink
              key={e.id}
              to={`/p/${project.key}/e/${e.id}`}
              className={({ isActive }) =>
                `block px-4 py-2 border-b border-line/50 row-hover ${
                  isActive ? "bg-accent/5 border-l-2 border-l-accent -ml-px" : ""
                }`
              }
            >
              <div className="flex items-center gap-2">
                <KindBadge kind={e.kind} compact />
                <span className="text-sm text-ink truncate flex-1">{e.title}</span>
                {e.status !== "open" && (
                  <span className="text-xxs text-faint">{e.status}</span>
                )}
              </div>
              {e.body && (
                <div className="text-xxs text-muted mt-0.5 truncate ml-7">
                  {e.body.replace(/\n/g, " ").slice(0, 100)}
                </div>
              )}
              {e.tags.length > 0 && (
                <div className="flex gap-1 mt-1 ml-7">
                  {e.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-center text-sm text-faint">
        <div className="text-center">
          <FileText size={32} className="mx-auto mb-2 opacity-50" />
          <div>Pick an item to view or edit.</div>
          <div className="mt-1 text-xxs">
            press <kbd>c</kbd> to create · <kbd>⌘K</kbd> to search
          </div>
        </div>
      </div>
    </div>
  );
}
