import { Calendar, ChevronDown, Cog, Inbox, Plus, Sunrise } from "lucide-react";
import { NavLink, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useProjects } from "../api/hooks";
import type { Project } from "../api/types";
import { usePersistedState } from "../hooks/usePersistedState";
import { useModals } from "../state/modals";
import { ProjectIcon } from "./ProjectIcon";
import { PopoverMenu } from "./tasks/PopoverMenu";

type ProjectSort = "key" | "name" | "recent";
const SORT_LABEL: Record<ProjectSort, string> = {
  key: "Key (A→Z)",
  name: "Name (A→Z)",
  recent: "Recently active"
};

function sortProjects(projects: Project[], sort: ProjectSort): Project[] {
  const copy = [...projects];
  if (sort === "key") return copy.sort((a, b) => a.key.localeCompare(b.key));
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  return copy.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export function ProjectsSidebar() {
  const { data: projects, isLoading } = useProjects();
  const { open } = useModals();
  const { key: activeKey } = useParams<{ key: string }>();
  const [sort, setSort] = usePersistedState<ProjectSort>("botnote.projectSort", "key");

  const sorted = useMemo(() => sortProjects(projects ?? [], sort), [projects, sort]);

  return (
    <aside className="w-52 shrink-0 border-r border-line bg-sidebar flex flex-col scrollbar-thin overflow-y-auto text-sm">
      <nav className="px-1.5 pt-2 space-y-px">
        <SidebarLink to="/" end icon={<Calendar size={12} className="opacity-70" />} label="Tasks" />
        <SidebarLink
          to="/today"
          icon={<Sunrise size={12} className="opacity-70" />}
          label="Today"
        />
        <SidebarLink
          to="/inbox"
          icon={<Inbox size={12} className="opacity-70" />}
          label="Inbox"
        />
        <SidebarLink
          to="/dashboard"
          icon={<svg width="12" height="12" viewBox="0 0 14 14" className="opacity-70"><rect x="2" y="2" width="4" height="4" rx="0.5" fill="currentColor"/><rect x="8" y="2" width="4" height="4" rx="0.5" fill="currentColor"/><rect x="2" y="8" width="4" height="4" rx="0.5" fill="currentColor"/><rect x="8" y="8" width="4" height="4" rx="0.5" fill="currentColor"/></svg>}
          label="Workspace"
        />
      </nav>

      <div className="mt-3 px-3 py-1.5 flex items-center justify-between">
        <div className="text-xxs uppercase tracking-wider text-muted font-medium">Projects</div>
        <div className="flex items-center gap-0.5">
          <PopoverMenu
            trigger={
              <button
                className="text-muted hover:text-ink p-0.5 rounded hover:bg-sidebarHover flex items-center gap-0.5"
                title={`Sort: ${SORT_LABEL[sort]}`}
              >
                <ChevronDown size={11} />
              </button>
            }
            align="end"
          >
            {(close) => (
              <>
                {(Object.keys(SORT_LABEL) as ProjectSort[]).map((s) => (
                  <button
                    key={s}
                    className="popover-item"
                    onClick={() => {
                      setSort(s);
                      close();
                    }}
                  >
                    <span>{SORT_LABEL[s]}</span>
                    {sort === s && <span className="ml-auto text-faint">✓</span>}
                  </button>
                ))}
              </>
            )}
          </PopoverMenu>
          <button
            className="text-muted hover:text-ink p-0.5 rounded hover:bg-sidebarHover"
            title="New project (n)"
            onClick={() => open({ kind: "new-project" })}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
      <nav className="px-1.5 space-y-px flex-1">
        {isLoading && <div className="px-2 py-1 text-xs text-faint">Loading…</div>}
        {!isLoading && sorted.length === 0 && (
          <button
            className="w-full text-left px-2 py-1 text-xs text-muted hover:bg-sidebarHover rounded"
            onClick={() => open({ kind: "new-project" })}
          >
            No projects yet. <span className="text-accent">Create →</span>
          </button>
        )}
        {sorted.map((p) => (
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
            <ProjectIcon color={p.color} icon={p.icon} size={11} />
            <span
              className="font-mono text-xxs tabular-nums opacity-90 shrink-0"
              style={{ color: p.color }}
            >
              {p.key}
            </span>
            <span className="truncate text-muted">{p.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line/60 px-1.5 py-1.5">
        <SidebarLink
          to="/settings"
          icon={<Cog size={12} className="opacity-70" />}
          label="Settings"
        />
      </div>
    </aside>
  );
}

function SidebarLink({
  to,
  end,
  icon,
  label
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2 px-2 py-1 rounded text-xs ${
          isActive ? "bg-accentSoft text-accentText" : "text-ink2 hover:bg-sidebarHover"
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
