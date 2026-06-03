import { Pin, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useUpdateEntity } from "../../api/hooks";
import type { Entity, Project } from "../../api/types";

export function PinnedNotesBanner({
  notes,
  project
}: {
  notes: Entity[];
  project: Project;
}) {
  const update = useUpdateEntity();

  if (notes.length === 0) return null;

  return (
    <div className="border-b border-line bg-accentSoft/30">
      <div className="px-4 py-2 flex items-start gap-3">
        <div className="flex items-center gap-1.5 text-accentText shrink-0 pt-0.5">
          <Pin size={11} fill="currentColor" />
          <span className="text-xxs uppercase tracking-wider font-semibold">
            Pinned · {notes.length}
          </span>
        </div>
        <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
          {notes.map((n) => (
            <Link
              key={n.id}
              to={`/p/${project.key}/e/${n.id}`}
              className="group inline-flex items-center gap-1 max-w-md bg-surface border border-line rounded px-2 py-1 hover:border-accent text-xs"
              title={n.body.slice(0, 240)}
            >
              <span className="text-ink2 truncate">{n.title}</span>
              <button
                className="text-faint hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  update.mutate({ id: n.id, fields: { pinned: false } });
                }}
                title="Unpin"
              >
                <X size={11} />
              </button>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
