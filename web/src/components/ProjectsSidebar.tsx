import { Calendar, FolderClosed, Inbox, Plus } from "lucide-react";
import { NavLink, useParams } from "react-router-dom";
import { useProjects, useRecent } from "../api/hooks";
import { useModals } from "../state/modals";

export function ProjectsSidebar() {
  const { data: projects, isLoading } = useProjects();
  const { data: recent } = useRecent({ limit: 8 });
  const { open } = useModals();
  const { key: activeKey } = useParams<{ key: string }>();

  return (
    <aside className="w-52 shrink-0 border-r border-line bg-sidebar flex flex-col scrollbar-thin overflow-y-auto text-sm">
      <nav className="px-1.5 pt-2 space-y-px">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-2 py-1 rounded text-xs ${
              isActive ? "bg-accentSoft text-accentText" : "text-ink2 hover:bg-sidebarHover"
            }`
          }
        >
          <Calendar size={12} className="opacity-70" />
          <span>Tasks</span>
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-2 px-2 py-1 rounded text-xs ${
              isActive ? "bg-accentSoft text-accentText" : "text-ink2 hover:bg-sidebarHover"
            }`
          }
        >
          <Inbox size={12} className="opacity-70" />
          <span>Workspace</span>
        </NavLink>
      </nav>

      <div className="mt-3 px-3 py-1.5 flex items-center justify-between">
        <div className="text-xxs uppercase tracking-wider text-muted font-medium">Projects</div>
        <button
          className="text-muted hover:text-ink p-0.5 rounded hover:bg-sidebarHover"
          title="New project (n)"
          onClick={() => open({ kind: "new-project" })}
        >
          <Plus size={11} />
        </button>
      </div>
      <nav className="px-1.5 space-y-px">
        {isLoading && <div className="px-2 py-1 text-xs text-faint">Loading…</div>}
        {!isLoading && projects && projects.length === 0 && (
          <button
            className="w-full text-left px-2 py-1 text-xs text-muted hover:bg-sidebarHover rounded"
            onClick={() => open({ kind: "new-project" })}
          >
            No projects yet. <span className="text-accent">Create →</span>
          </button>
        )}
        {projects?.map((p) => (
          <NavLink
            key={p.id}
            to={`/p/${p.key}`}
            className={({ isActive }) =>
              `flex items-center gap-2 px-2 py-1 text-xs rounded ${
                isActive || activeKey === p.key
                  ? "bg-accentSoft text-accentText"
                  : "text-ink2 hover:bg-sidebarHover"
              }`
            }
          >
            <FolderClosed size={11} className="opacity-60" />
            <span className="font-mono text-xxs tabular-nums opacity-80 shrink-0">{p.key}</span>
            <span className="truncate text-muted">{p.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 px-3 py-1.5 text-xxs uppercase tracking-wider text-muted font-medium">
        Recent
      </div>
      <div className="px-1.5 space-y-px pb-4">
        {recent?.slice(0, 8).map((e) => (
          <div
            key={e.id}
            className="px-2 py-0.5 text-xxs text-muted truncate"
            title={e.title}
          >
            {e.title}
          </div>
        ))}
        {(!recent || recent.length === 0) && (
          <div className="px-2 py-0.5 text-xxs text-faint">no activity yet</div>
        )}
      </div>
    </aside>
  );
}
