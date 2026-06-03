import { Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useEntityList, useUpdateEntity } from "../../api/hooks";
import type { Project } from "../../api/types";
import { displayTitle, isUntitled } from "../../lib/entityTitle";
import { useModals } from "../../state/modals";

export function NotesList({ project }: { project: Project }) {
  const [search, setSearch] = useSearchParams();
  const update = useUpdateEntity();
  const { open } = useModals();
  const { data: notes } = useEntityList(project.id, ["note"]);
  const [filter, setFilter] = useState<"all" | "pinned">("all");

  function openDetail(id: string) {
    search.set("d", id);
    setSearch(search, { replace: true });
  }

  const filtered = (notes ?? []).filter((n) => (filter === "pinned" ? n.pinned : true));

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 h-9 flex items-center justify-between border-b border-line bg-surface">
        <div className="flex items-center gap-2">
          <div className="seg">
            <button data-active={filter === "all"} onClick={() => setFilter("all")}>
              All <span className="text-faint ml-1">{notes?.length ?? 0}</span>
            </button>
            <button data-active={filter === "pinned"} onClick={() => setFilter("pinned")}>
              Pinned <span className="text-faint ml-1">{notes?.filter((n) => n.pinned).length ?? 0}</span>
            </button>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => open({ kind: "quick-create", projectId: project.id })}>
          + Note
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-surface">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">
            {filter === "pinned" ? "No pinned notes yet." : "No notes yet."}
            <div className="text-faint mt-1">
              {filter === "pinned"
                ? "Pin notes to surface them in opening brief for agents."
                : "Press c to create one."}
            </div>
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              className="px-4 py-2.5 border-b border-lineSoft row-hover cursor-pointer group"
              onClick={() => openDetail(n.id)}
            >
              <div className="flex items-start gap-2">
                <button
                  className={`shrink-0 mt-0.5 p-0.5 -m-0.5 rounded hover:bg-line/40 ${
                    n.pinned ? "text-accent" : "text-faint hover:text-ink"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    update.mutate({ id: n.id, fields: { pinned: !n.pinned } });
                  }}
                  title={n.pinned ? "Unpin" : "Pin to opening brief"}
                >
                  {n.pinned ? (
                    <Pin size={12} fill="currentColor" />
                  ) : (
                    <PinOff size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm truncate ${
                      isUntitled(n) ? "text-muted italic" : "text-ink"
                    }`}
                  >
                    {displayTitle(n)}
                  </div>
                  {!isUntitled(n) && n.body && (
                    <div className="text-xs text-muted truncate mt-0.5">
                      {n.body.replace(/\n/g, " ").slice(0, 200)}
                    </div>
                  )}
                  <div className="text-xxs text-faint mt-1 flex items-center gap-2">
                    <span>{formatDistanceToNow(new Date(n.updatedAt), { addSuffix: true })}</span>
                    <span>·</span>
                    <span>{n.actorKind}</span>
                    {n.tags.length > 0 && (
                      <>
                        <span>·</span>
                        {n.tags.slice(0, 3).map((t) => (
                          <span key={t} className="chip !h-4 !text-[10px]">
                            {t}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
