import { FolderKanban, Plus } from "lucide-react";
import { NavLink, useParams } from "react-router-dom";
import { useProjects, useRecent } from "../api/hooks";
import { useModals } from "../state/modals";

const KIND_GLYPH: Record<string, string> = {
  task: "☑",
  note: "✎",
  decision: "◆",
  doc: "📄",
  comment: "💬",
  log: "·",
  memory: "✦"
};

export function ProjectsSidebar() {
  const { data: projects, isLoading } = useProjects();
  const { data: recent } = useRecent({ limit: 10 });
  const { open } = useModals();
  const { key: activeKey } = useParams<{ key: string }>();

  return (
    <aside className="w-56 shrink-0 border-r border-line bg-sidebar flex flex-col scrollbar-thin overflow-y-auto">
      <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-sidebar z-10">
        <div className="text-xxs uppercase tracking-wider text-muted font-medium">Projects</div>
        <button
          className="text-muted hover:text-ink p-0.5 rounded hover:bg-line/60"
          title="New project (n)"
          onClick={() => open({ kind: "new-project" })}
        >
          <Plus size={13} />
        </button>
      </div>

      <nav className="px-1 space-y-px">
        {isLoading && (
          <div className="px-2 py-1.5 text-xs text-faint">Loading…</div>
        )}
        {!isLoading && projects && projects.length === 0 && (
          <button
            className="w-full text-left px-2 py-1.5 text-xs text-muted hover:bg-line/40 rounded"
            onClick={() => open({ kind: "new-project" })}
          >
            No projects yet. <span className="text-accent">Create one →</span>
          </button>
        )}
        {projects?.map((p) => (
          <NavLink
            key={p.id}
            to={`/p/${p.key}`}
            className={({ isActive }) =>
              `flex items-center gap-2 px-2 py-1 text-sm rounded ${
                isActive || activeKey === p.key
                  ? "bg-accent/10 text-accent"
                  : "text-ink hover:bg-line/40"
              }`
            }
          >
            <FolderKanban size={13} className="opacity-60" />
            <span className="font-mono text-xs">{p.key}</span>
            <span className="truncate text-xs text-muted">{p.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 px-3 py-2 text-xxs uppercase tracking-wider text-muted font-medium sticky bg-sidebar">
        Recent
      </div>
      <div className="px-1 space-y-px pb-4">
        {recent?.slice(0, 10).map((e) => (
          <div
            key={e.id}
            className="px-2 py-1 text-xs text-muted truncate"
            title={e.title}
          >
            <span className="mr-1 opacity-70">{KIND_GLYPH[e.kind] ?? "·"}</span>
            {e.title}
          </div>
        ))}
        {(!recent || recent.length === 0) && (
          <div className="px-2 py-1 text-xs text-faint">no activity yet</div>
        )}
      </div>
    </aside>
  );
}
