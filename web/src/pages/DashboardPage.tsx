import { Activity, FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { useProjects, useRecent } from "../api/hooks";
import { KindBadge } from "../components/KindBadge";
import { ProjectIcon } from "../components/ProjectIcon";
import { useDrawer } from "../hooks/useDrawer";
import { displayTitle, isUntitled } from "../lib/entityTitle";

export function DashboardPage() {
  const { data: projects } = useProjects();
  const { data: recent } = useRecent({ limit: 20 });
  const drawer = useDrawer();

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <header>
          <h1 className="text-xl font-semibold text-ink">Workspace</h1>
          <p className="text-sm text-muted mt-1">
            Projects, tasks, notes, decisions, and memory — written by you or by your agents.
          </p>
        </header>

        <section>
          <div className="flex items-center gap-2 mb-3 text-muted">
            <FolderKanban size={14} />
            <h2 className="text-xs uppercase tracking-wider font-medium">
              Projects ({projects?.length ?? 0})
            </h2>
          </div>
          {projects && projects.length === 0 ? (
            <div className="border border-dashed border-line rounded-lg p-6 text-center text-sm text-muted">
              No projects yet. Press <kbd>n</kbd> to create one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {projects?.map((p) => (
                <Link
                  to={`/p/${p.key}`}
                  key={p.id}
                  className="border border-line rounded-md p-3 bg-surface hover:border-accent/50 transition-colors block"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ProjectIcon color={p.color} icon={p.icon} size={12} />
                      <span className="font-mono text-xs" style={{ color: p.color }}>
                        {p.key}
                      </span>
                    </div>
                    <span className="text-xxs text-faint">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-ink mt-1 truncate">{p.name}</div>
                  {p.agentsMd && (
                    <div className="text-xxs text-muted mt-1 truncate">
                      AGENTS.md · {p.agentsMd.length} chars
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3 text-muted">
            <Activity size={14} />
            <h2 className="text-xs uppercase tracking-wider font-medium">Recent activity</h2>
          </div>
          {recent && recent.length === 0 ? (
            <div className="text-sm text-muted">Nothing yet.</div>
          ) : (
            <div className="bg-surface border border-line rounded-md divide-y divide-line/60">
              {recent?.map((e) => {
                const project = projects?.find((p) => p.id === e.projectId);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => drawer.open(e.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 row-hover"
                  >
                    <KindBadge kind={e.kind} />
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm truncate ${
                          isUntitled(e) ? "text-muted italic" : "text-ink"
                        }`}
                      >
                        {displayTitle(e)}
                      </div>
                      <div className="text-xxs text-muted mt-0.5">
                        {project ? project.key : "—"} · {timeAgo(e.createdAt)} ·{" "}
                        <span className="opacity-70">{e.actorKind}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}
