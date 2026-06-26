import { Activity, ChevronDown, ChevronRight, FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { useProjects, useRecent } from "../api/hooks";
import type { Project, ProjectStatus } from "../api/types";
import { KindBadge } from "../components/KindBadge";
import { ProjectIcon } from "../components/ProjectIcon";
import { useDrawer } from "../hooks/useDrawer";
import { usePersistedState } from "../hooks/usePersistedState";
import { displayTitle, isUntitled } from "../lib/entityTitle";
import { PROJECT_STATUS_GROUPS, PROJECT_STATUS_LABEL } from "../lib/projectStatus";

const DEFAULT_COLLAPSED_GROUPS: Partial<Record<ProjectStatus, boolean>> = {
  archived: true
};

export function DashboardPage() {
  const { data: projects } = useProjects({ includeArchived: true });
  const { data: recent } = useRecent({ limit: 20 });
  const drawer = useDrawer();
  const [collapsedGroups, setCollapsedGroups] = usePersistedState<
    Partial<Record<ProjectStatus, boolean>>
  >("botnote.workspace.projectGroups.collapsed", DEFAULT_COLLAPSED_GROUPS);
  const projectGroups = PROJECT_STATUS_GROUPS.map((status) => ({
    status,
    projects: (projects ?? []).filter((p) => p.status === status)
  })).filter((group) => group.projects.length > 0);
  const groupCollapsed = (status: ProjectStatus) =>
    collapsedGroups[status] ?? DEFAULT_COLLAPSED_GROUPS[status] ?? false;
  const toggleGroup = (status: ProjectStatus) => {
    const collapsed = groupCollapsed(status);
    setCollapsedGroups({ ...collapsedGroups, [status]: !collapsed });
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <header>
          <h1 className="text-xl font-semibold text-ink">Workspace</h1>
          <p className="text-sm text-muted mt-1">
            Projects, tasks, notes, and memory — written by you or by your agents.
          </p>
        </header>

        <section className="space-y-5">
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
            projectGroups.map((group) => (
              <ProjectGroup
                key={group.status}
                status={group.status}
                projects={group.projects}
                collapsed={groupCollapsed(group.status)}
                onToggle={() => toggleGroup(group.status)}
              />
            ))
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

function ProjectGroup({
  status,
  projects,
  collapsed,
  onToggle
}: {
  status: ProjectStatus;
  projects: Project[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 mb-2 text-muted hover:text-ink"
        onClick={onToggle}
        title={`${collapsed ? "Expand" : "Collapse"} ${PROJECT_STATUS_LABEL[status]}`}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span className="text-xxs uppercase tracking-wider font-medium">
          {PROJECT_STATUS_LABEL[status]} ({projects.length})
        </span>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/p/${project.key}`}
      className={`border border-line rounded-md p-3 bg-surface hover:border-accent/50 transition-colors block ${
        project.status === "archived" ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <ProjectIcon color={project.color} icon={project.icon} size={12} />
          <span className="font-mono text-xs shrink-0" style={{ color: project.color }}>
            {project.key}
          </span>
        </div>
        <span className="text-xxs text-faint shrink-0">
          {new Date(project.updatedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="text-sm font-medium text-ink mt-1 truncate">{project.name}</div>
      {project.agentsMd && (
        <div className="text-xxs text-muted mt-1 truncate">
          AGENTS.md · {project.agentsMd.length} chars
        </div>
      )}
    </Link>
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
