import { RotateCcw, Trash2, X } from "lucide-react";
import { useProjects, usePurgeEntity, useRestoreEntity, useTrash } from "../api/hooks";
import { KindBadge } from "../components/KindBadge";
import { displayTitle, isUntitled } from "../lib/entityTitle";

export function TrashPage() {
  const { data: trash } = useTrash(200);
  const { data: projects } = useProjects({ includeArchived: true });
  const restore = useRestoreEntity();
  const purge = usePurgeEntity();

  const emptyTrash = () => {
    if (!trash || trash.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete all ${trash.length} item(s) in the trash? This cannot be undone.`
      )
    ) {
      return;
    }
    for (const e of trash) purge.mutate(e.id);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
              <Trash2 size={18} className="text-muted" /> Trash
            </h1>
            <p className="text-sm text-muted mt-1">
              Deleted items land here and are purged automatically after 30 days.
            </p>
          </div>
          {trash && trash.length > 0 && (
            <button
              className="btn btn-ghost !h-7 !px-2.5 text-xs gap-1 shrink-0 hover:!text-red-600"
              onClick={emptyTrash}
            >
              <X size={12} /> Empty trash
            </button>
          )}
        </header>

        {trash && trash.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg p-8 text-center text-sm text-muted">
            Trash is empty.
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-md divide-y divide-line/60">
            {trash?.map((e) => {
              const project = projects?.find((p) => p.id === e.projectId);
              return (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2 row-hover group">
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
                      {project ? project.key : "—"} · deleted{" "}
                      {e.deletedAt ? timeAgo(e.deletedAt) : "—"} ·{" "}
                      <span className="opacity-70">{e.actorKind}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="btn btn-ghost !h-6 !px-2 text-xxs gap-1"
                      title="Restore"
                      onClick={() => restore.mutate(e.id)}
                    >
                      <RotateCcw size={11} /> Restore
                    </button>
                    <button
                      className="btn btn-ghost !h-6 !px-2 text-xxs gap-1 hover:!text-red-600"
                      title="Delete forever"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Permanently delete "${displayTitle(e)}"? This cannot be undone.`
                          )
                        ) {
                          purge.mutate(e.id);
                        }
                      }}
                    >
                      <Trash2 size={11} /> Delete forever
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
