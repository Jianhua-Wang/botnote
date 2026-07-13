import { Activity, Check, ChevronDown, ChevronRight, FolderKanban, Megaphone, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFeedback, useProjects, useRecent, useTasksRange, useUpdateEntity } from "../api/hooks";
import type { FeedbackCategory, FeedbackStatus, Project, ProjectStatus } from "../api/types";
import { FEEDBACK_CATEGORIES } from "../api/types";
import { KindBadge } from "../components/KindBadge";
import { ProjectIcon } from "../components/ProjectIcon";
import { useDrawer } from "../hooks/useDrawer";
import { usePersistedState } from "../hooks/usePersistedState";
import { isTaskOverdue } from "../components/tasks/utils";
import { displayTitle, isUntitled } from "../lib/entityTitle";
import { PROJECT_STATUS_GROUPS, PROJECT_STATUS_LABEL } from "../lib/projectStatus";

const DEFAULT_COLLAPSED_GROUPS: Partial<Record<ProjectStatus, boolean>> = {
  archived: true
};

export function DashboardPage() {
  const { data: projects } = useProjects({ includeArchived: true });
  const { data: recent } = useRecent({ limit: 20 });
  // One workspace-wide query feeds every card's open/overdue counts.
  const { data: openTasks } = useTasksRange({ includeBacklog: true, includeDone: false });
  const drawer = useDrawer();

  const counts = new Map<string, { open: number; overdue: number }>();
  if (openTasks) {
    const now = new Date();
    const all = [...openTasks.scheduled, ...openTasks.overdue, ...openTasks.backlog];
    for (const t of all) {
      if (!t.projectId || t.status === "rejected") continue;
      const c = counts.get(t.projectId) ?? { open: 0, overdue: 0 };
      c.open += 1;
      if (isTaskOverdue(t, now)) c.overdue += 1;
      counts.set(t.projectId, c);
    }
  }
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
                counts={counts}
                collapsed={groupCollapsed(group.status)}
                onToggle={() => toggleGroup(group.status)}
              />
            ))
          )}
        </section>

        <FeedbackSection />

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

const CATEGORY_STYLE: Record<FeedbackCategory, string> = {
  bug: "text-red-700 bg-red-50 border-red-100",
  feature: "text-blue-700 bg-blue-50 border-blue-100",
  friction: "text-amber-700 bg-amber-50 border-amber-100",
  idea: "text-purple-700 bg-purple-50 border-purple-100"
};

const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "rejected", label: "Rejected" }
];

function FeedbackSection() {
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [status, setStatus] = useState<FeedbackStatus>("open");
  const { data: feedback } = useFeedback({ category, status, limit: 50 });
  const update = useUpdateEntity();
  const drawer = useDrawer();

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-muted">
        <Megaphone size={14} />
        <h2 className="text-xs uppercase tracking-wider font-medium">Product feedback</h2>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <div className="seg">
          {FEEDBACK_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              data-active={status === s.value}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-line mx-1" />
        <button
          className={`h-6 px-2.5 text-xxs rounded-full border transition-colors ${
            !category
              ? "bg-accentSoft text-accentText border-accent/30"
              : "bg-surface text-muted border-line hover:text-ink"
          }`}
          onClick={() => setCategory(null)}
        >
          All
        </button>
        {FEEDBACK_CATEGORIES.map((c) => (
          <button
            key={c}
            className={`h-6 px-2.5 text-xxs rounded-full border capitalize transition-colors ${
              category === c ? CATEGORY_STYLE[c] : "bg-surface text-muted border-line hover:text-ink"
            }`}
            onClick={() => setCategory(category === c ? null : c)}
          >
            {c}
          </button>
        ))}
      </div>

      {feedback && feedback.length === 0 ? (
        <div className="border border-dashed border-line rounded-md p-4 text-center text-xs text-muted">
          No {status.replace("_", " ")} feedback{category ? ` in “${category}”` : ""}.
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-md divide-y divide-line/60">
          {feedback?.map((f) => {
            const cat = (f.metadata.category as FeedbackCategory | undefined) ?? "idea";
            const tool = f.metadata.tool as string | undefined;
            const resolvable = f.status === "open" || f.status === "in_progress";
            return (
              <div
                key={f.id}
                className="flex items-start gap-3 px-3 py-2 row-hover cursor-pointer group"
                onClick={() => drawer.open(f.id)}
              >
                <span
                  className={`inline-flex items-center px-1.5 h-5 mt-0.5 text-xxs rounded border capitalize shrink-0 ${CATEGORY_STYLE[cat]}`}
                >
                  {cat}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm truncate ${isUntitled(f) ? "text-muted italic" : "text-ink"}`}
                  >
                    {displayTitle(f)}
                  </div>
                  <div className="text-xxs text-muted mt-0.5">
                    {tool && <span className="font-mono">{tool} · </span>}
                    {f.actorKind} · {timeAgo(f.createdAt)}
                  </div>
                </div>
                {resolvable && (
                  <div
                    className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="btn btn-ghost !h-6 !px-2 text-xxs gap-1"
                      title="Mark done"
                      onClick={() => update.mutate({ id: f.id, fields: { status: "done" } })}
                    >
                      <Check size={11} /> Done
                    </button>
                    <button
                      className="btn btn-ghost !h-6 !px-2 text-xxs gap-1 hover:!text-red-600"
                      title="Reject"
                      onClick={() => update.mutate({ id: f.id, fields: { status: "rejected" } })}
                    >
                      <X size={11} /> Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProjectGroup({
  status,
  projects,
  counts,
  collapsed,
  onToggle
}: {
  status: ProjectStatus;
  projects: Project[];
  counts: Map<string, { open: number; overdue: number }>;
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
            <ProjectCard key={p.id} project={p} counts={counts.get(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  counts
}: {
  project: Project;
  counts?: { open: number; overdue: number };
}) {
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
          Updated {new Date(project.updatedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="text-sm font-medium text-ink mt-1 truncate">{project.name}</div>
      <div className="text-xxs text-muted mt-1 flex items-center gap-2">
        <span>{counts?.open ?? 0} open</span>
        {counts && counts.overdue > 0 && (
          <span className="text-danger font-medium">{counts.overdue} overdue</span>
        )}
        {project.agentsMd && <span className="text-faint">· AGENTS.md</span>}
      </div>
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
