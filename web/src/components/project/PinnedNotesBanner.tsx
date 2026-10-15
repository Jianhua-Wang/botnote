import { PushPinIcon, XIcon } from "@phosphor-icons/react";
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
    <div className="border-b border-kumo-line bg-kumo-brand-tint/30">
      <div className="px-4 py-2 flex items-start gap-3">
        <div className="flex items-center gap-1.5 text-kumo-link shrink-0 pt-0.5">
          <PushPinIcon size={11} weight="fill" />
          <span className="text-xxs uppercase tracking-wider font-semibold">
            Pinned · {notes.length}
          </span>
        </div>
        <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
          {notes.map((n) => (
            <Link
              key={n.id}
              to={`/p/${project.key}/e/${n.id}`}
              className="group inline-flex items-center gap-1 max-w-md bg-kumo-base border border-kumo-line rounded-md px-2 py-1 hover:border-kumo-brand text-xs transition-colors"
              title={n.body.slice(0, 240)}
            >
              <span className="text-kumo-default truncate">{n.title}</span>
              <button
                type="button"
                aria-label="Unpin"
                className="text-kumo-placeholder hover:text-kumo-danger opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  update.mutate({ id: n.id, fields: { pinned: false } });
                }}
                title="Unpin"
              >
                <XIcon size={11} />
              </button>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
