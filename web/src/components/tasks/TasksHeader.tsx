import { ChevronLeft, ChevronRight, Filter, Plus } from "lucide-react";
import { useProjects } from "../../api/hooks";
import type { Project } from "../../api/types";
import { useModals } from "../../state/modals";
import { moveAnchor, rangeLabel, type CalendarView } from "./utils";

export function TasksHeader({
  view,
  setView,
  anchor,
  setAnchor,
  projectIds,
  setProjectIds
}: {
  view: CalendarView;
  setView: (v: CalendarView) => void;
  anchor: Date;
  setAnchor: (d: Date) => void;
  projectIds: string[] | null;
  setProjectIds: (ids: string[] | null) => void;
}) {
  const { data: projects } = useProjects();
  const { open } = useModals();

  const projectLabel = !projectIds
    ? "All projects"
    : projectIds.length === 1
      ? projects?.find((p) => p.id === projectIds[0])?.key ?? "1 project"
      : `${projectIds.length} projects`;

  return (
    <div className="border-b border-line bg-surface">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-ink">Tasks</h1>
          <div className="flex border border-line rounded overflow-hidden">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs capitalize ${
                  view === v
                    ? "bg-ink text-white"
                    : "bg-surface text-muted hover:bg-sidebar"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => setAnchor(moveAnchor(view, anchor, -1))}
              className="btn btn-ghost !h-7 !w-7 !p-0"
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setAnchor(moveAnchor(view, anchor, 0))}
              className="btn btn-ghost !h-7 px-2 text-xs"
              title="Today"
            >
              Today
            </button>
            <button
              onClick={() => setAnchor(moveAnchor(view, anchor, 1))}
              className="btn btn-ghost !h-7 !w-7 !p-0"
              title="Next"
            >
              <ChevronRight size={14} />
            </button>
            <div className="ml-2 text-sm font-medium text-ink">{rangeLabel(view, anchor)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ProjectFilter
            projects={projects ?? []}
            projectIds={projectIds}
            setProjectIds={setProjectIds}
            label={projectLabel}
          />
          <button
            className="btn btn-primary"
            onClick={() => open({ kind: "quick-create" })}
            title="New task (c)"
          >
            <Plus size={13} />
            <span className="text-xs">Task</span>
            <kbd className="!bg-white/10 !border-white/20 !text-white">c</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectFilter({
  projects,
  projectIds,
  setProjectIds,
  label
}: {
  projects: Project[];
  projectIds: string[] | null;
  setProjectIds: (ids: string[] | null) => void;
  label: string;
}) {
  return (
    <details className="relative">
      <summary className="btn list-none cursor-pointer">
        <Filter size={12} />
        <span className="text-xs">{label}</span>
      </summary>
      <div className="absolute right-0 top-8 z-40 bg-surface border border-line rounded shadow-lg w-56 p-2 space-y-1">
        <button
          className={`w-full text-left px-2 py-1 text-xs rounded ${
            !projectIds ? "bg-accent/10 text-accent" : "text-ink hover:bg-sidebar"
          }`}
          onClick={() => setProjectIds(null)}
        >
          All projects
        </button>
        <div className="border-t border-line my-1" />
        {projects.map((p) => {
          const isOn = projectIds?.includes(p.id) ?? false;
          return (
            <label
              key={p.id}
              className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-sidebar cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => {
                  if (!projectIds) {
                    setProjectIds([p.id]);
                  } else if (isOn) {
                    const rest = projectIds.filter((id) => id !== p.id);
                    setProjectIds(rest.length ? rest : null);
                  } else {
                    setProjectIds([...projectIds, p.id]);
                  }
                }}
              />
              <span className="font-mono text-accent">{p.key}</span>
              <span className="text-muted truncate">{p.name}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
