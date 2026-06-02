import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects, useWriteEntity } from "../../api/hooks";
import { ENTITY_KINDS, type EntityKind } from "../../api/types";
import { useModals } from "../../state/modals";
import { ModalShell } from "../ModalShell";

export function QuickCreateModal({ initialProjectId }: { initialProjectId?: string }) {
  const { data: projects } = useProjects();
  const [kind, setKind] = useState<EntityKind>("note");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const write = useWriteEntity();
  const { close } = useModals();
  const navigate = useNavigate();

  const project = projects?.find((p) => p.id === projectId);
  const valid = title.trim().length > 0 && projectId.length > 0;

  return (
    <ModalShell title="Quick create" width="max-w-xl">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const entity = await write.mutateAsync({
            kind,
            projectId,
            title: title.trim(),
            body: body.trim(),
            tags: tagsStr
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            actorKind: "human"
          });
          close();
          if (project) {
            navigate(`/p/${project.key}/e/${entity.id}`);
          }
        }}
        className="p-3 space-y-3"
      >
        <div className="flex gap-2">
          <select
            className="input w-32"
            value={kind}
            onChange={(e) => setKind(e.target.value as EntityKind)}
          >
            {ENTITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="input flex-1"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— pick a project —</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <input
          autoFocus
          className="input"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input !h-32 py-1.5 font-mono text-xs leading-snug resize-y"
          placeholder="Body (Markdown, optional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <input
          className="input"
          placeholder="Tags (comma-separated, optional)"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
        />
        <div className="flex justify-between items-center pt-1">
          <div className="text-xxs text-muted">
            <kbd>⌘</kbd>+<kbd>Enter</kbd> to submit · <kbd>Esc</kbd> to close
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!valid || write.isPending}>
              {write.isPending ? "Creating…" : `Create ${kind}`}
            </button>
          </div>
        </div>
        {write.error && (
          <div className="text-xs text-danger">{(write.error as Error).message}</div>
        )}
      </form>
    </ModalShell>
  );
}
