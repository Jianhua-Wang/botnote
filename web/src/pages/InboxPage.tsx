import { Inbox } from "lucide-react";
import { useMemo } from "react";
import { useProjects, useRecent } from "../api/hooks";
import { useDrawer } from "../hooks/useDrawer";
import { displayTitle, isUntitled } from "../lib/entityTitle";
import { KindBadge } from "../components/KindBadge";
import { useModals } from "../state/modals";

export function InboxPage() {
  const { data: recent } = useRecent({ projectId: null, limit: 100 });
  const { data: projects } = useProjects();
  const drawer = useDrawer();
  const { open: openModal } = useModals();

  const items = useMemo(() => recent ?? [], [recent]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        <header className="flex items-baseline gap-3">
          <Inbox size={18} className="text-accent" />
          <h1 className="text-lg font-semibold">Inbox</h1>
          <span className="text-xs text-muted">No-project entities</span>
        </header>

        <p className="text-xs text-muted">
          Quick-capture entities that don't have a project yet. Open one and re-link it via the drawer.
        </p>

        {items.length === 0 ? (
          <div className="border border-dashed border-line rounded-md p-8 text-center">
            <div className="text-sm text-muted">Inbox empty.</div>
            {projects && projects.length > 0 && (
              <button
                className="mt-2 text-xs text-accent hover:underline"
                onClick={() => openModal({ kind: "quick-create" })}
              >
                + capture something
              </button>
            )}
          </div>
        ) : (
          <div className="border border-line rounded-md bg-surface divide-y divide-lineSoft">
            {items.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => drawer.open(e.id)}
                className="w-full text-left px-3 py-2 flex items-start gap-3 hover:bg-sidebar"
              >
                <KindBadge kind={e.kind} />
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm truncate ${
                      isUntitled(e) ? "italic text-muted" : "text-ink"
                    }`}
                  >
                    {displayTitle(e)}
                  </div>
                  {!isUntitled(e) && e.body && (
                    <div className="text-xxs text-muted truncate mt-0.5">
                      {e.body.replace(/\n/g, " ").slice(0, 160)}
                    </div>
                  )}
                  <div className="text-xxs text-faint mt-0.5">
                    {new Date(e.createdAt).toLocaleString()} · {e.actorKind}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
