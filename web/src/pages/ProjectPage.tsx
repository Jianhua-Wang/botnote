import { FileText, KanbanSquare, Settings2, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEntityList, useProjectByKey } from "../api/hooks";
import { KanbanBoard } from "../components/project/KanbanBoard";
import { NotesList } from "../components/project/NotesList";
import { ProjectIcon } from "../components/ProjectIcon";
import { PROJECT_STATUS_LABEL } from "../lib/projectStatus";
import { useModals } from "../state/modals";

type Tab = "tasks" | "notes" | "agents-md";

export function ProjectPage() {
  const { key } = useParams<{ key: string }>();
  const [search, setSearch] = useSearchParams();
  const tab = (search.get("tab") as Tab) || "tasks";

  const { data: project } = useProjectByKey(key);
  const { data: tasks } = useEntityList(project?.id, ["task"], { poll: true });
  const { open: openModal } = useModals();

  const counts = useMemo(() => {
    const t = tasks ?? [];
    return {
      todo: t.filter((x) => x.status === "open").length,
      in_progress: t.filter((x) => x.status === "in_progress").length,
      done: t.filter((x) => x.status === "done").length,
      tasks: t.length
    };
  }, [tasks]);

  if (!project) {
    return <div className="p-6 text-sm text-muted">Loading project…</div>;
  }

  const setTab = (t: Tab) => {
    if (t === "tasks") {
      search.delete("tab");
    } else {
      search.set("tab", t);
    }
    setSearch(search, { replace: true });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 px-4 border-b border-line bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ProjectIcon color={project.color} icon={project.icon} size={14} />
          <span className="font-mono text-xs tabular-nums" style={{ color: project.color }}>
            {project.key}
          </span>
          <span className="text-sm font-semibold text-ink truncate">{project.name}</span>
          <span className="chip">{PROJECT_STATUS_LABEL[project.status]}</span>
          <button
            className="ml-1 p-1 -m-1 text-faint hover:text-ink rounded hover:bg-sidebar"
            onClick={() => openModal({ kind: "edit-project", projectId: project.id })}
            title="Project settings"
          >
            <SlidersHorizontal size={11} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <div className="seg">
            <button data-active={tab === "tasks"} onClick={() => setTab("tasks")}>
              <KanbanSquare size={11} className="inline mr-1" />
              Tasks <span className="text-faint ml-1">{counts.tasks}</span>
            </button>
            <button data-active={tab === "notes"} onClick={() => setTab("notes")}>
              <FileText size={11} className="inline mr-1" />
              Notes
            </button>
            <Link
              to={`/p/${project.key}/agents-md`}
              className="px-2 h-7 text-xs hover:text-ink hover:bg-sidebar transition-colors text-muted flex items-center"
            >
              <Settings2 size={11} className="inline mr-1" />
              AGENTS.md
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "tasks" && <KanbanBoard tasks={tasks ?? []} project={project} />}
        {tab === "notes" && <NotesList project={project} />}
      </div>
    </div>
  );
}
