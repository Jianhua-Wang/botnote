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
      <div className="flex items-center justify-between h-11 px-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-semibold text-ink">Tasks</h1>
          <div className="seg">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                data-active={view === v}
                className="capitalize"
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={() => setAnchor(moveAnchor(view, anchor, -1))}
              className="btn btn-ghost !h-6 !w-6 !p-0"
              title="Previous"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => setAnchor(moveAnchor(view, anchor, 0))}
              className="btn !h-6 px-2 text-xxs"
              title="Today"
            >
              Today
            </button>
            <button
              onClick={() => setAnchor(moveAnchor(view, anchor, 1))}
              className="btn btn-ghost !h-6 !w-6 !p-0"
              title="Next"
            >
              <ChevronRight size={12} />
            </button>
            <div className="ml-2 text-xs font-medium text-ink2 tabular-nums">
              {rangeLabel(view, anchor)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
            <Plus size={11} />
            <span className="text-xs">Task</span>
            <kbd className="!bg-white/15 !border-white/25 !text-white">c</kbd>
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
        <Filter size={11} />
        <span className="text-xs">{label}</span>
      </summary>
      <div className="popover top-9 right-0 w-56 px-1 py-1.5">
        <button
          className={`popover-item ${!projectIds ? "bg-accentSoft text-accentText" : ""}`}
          onClick={() => setProjectIds(null)}
        >
          <span>All projects</span>
          {!projectIds && <span className="ml-auto text-faint">✓</span>}
        </button>
        <div className="divider my-1" />
        {projects.map((p) => {
          const isOn = projectIds?.includes(p.id) ?? false;
          return (
            <label
              key={p.id}
              className="popover-item gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                className="cursor-pointer"
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
              <span className="font-mono text-xxs text-faint tabular-nums">{p.key}</span>
              <span className="text-ink2 truncate">{p.name}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
