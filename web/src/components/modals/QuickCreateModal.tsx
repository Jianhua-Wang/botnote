import { useState } from "react";
import { useEntityList, useProjects, useWriteEntity } from "../../api/hooks";
import { CREATABLE_KINDS, PRIORITY_LEVELS, type EntityKind, type Priority } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { displayTitle } from "../../lib/entityTitle";
import { useModals } from "../../state/modals";
import { ModalShell } from "../ModalShell";
import { PriorityIcon, PRIORITY_LABEL } from "../tasks/icons";

export function QuickCreateModal({
  initialProjectId,
  initialKind,
  initialParentId
}: {
  initialProjectId?: string;
  initialKind?: EntityKind;
  initialParentId?: string;
}) {
  const { data: projects } = useProjects();
  const [kind, setKind] = useState<EntityKind>(initialKind ?? "task");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [pinned, setPinned] = useState(false);
  const [parentId, setParentId] = useState<string>(initialParentId ?? "");
  const write = useWriteEntity();
  const { close } = useModals();
  const { open: openDrawer } = useDrawer();

  const project = projects?.find((p) => p.id === projectId);
  const isNote = kind === "note";
  const { data: projectTasks } = useEntityList(
    isNote && projectId ? projectId : undefined,
    ["task"]
  );

  const valid =
    projectId.length > 0 &&
    (isNote
      ? title.trim().length > 0 || body.trim().length > 0
      : title.trim().length > 0);

  return (
    <ModalShell title="Quick create" width="max-w-xl">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const trimmedTitle = title.trim();
          const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
          const entity =
            kind === "task"
              ? await write.mutateAsync({
                  kind: "task",
                  projectId,
                  title: trimmedTitle,
                  body: body.trim(),
                  tags,
                  actorKind: "human",
                  dueAt: dueDate ? new Date(dueDate).toISOString() : null,
                  priority
                })
              : await write.mutateAsync({
                  kind: "note",
                  projectId,
                  title: trimmedTitle || null,
                  body: body.trim(),
                  tags,
                  actorKind: "human",
                  pinned,
                  parentId: parentId || null
                });
          close();
          openDrawer(entity.id);
        }}
        className="p-3 space-y-3"
      >
        <div className="flex gap-2">
          <div className="seg w-32">
            {CREATABLE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                data-active={kind === k}
                onClick={() => setKind(k)}
                className="flex-1 justify-center capitalize"
              >
                {k}
              </button>
            ))}
          </div>
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
          placeholder={isNote ? "Title (optional)" : "Title"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input !h-32 py-1.5 font-mono text-xs leading-snug resize-y"
          placeholder="Body (Markdown, optional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Tags (comma-separated, optional)"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
          />
          {kind === "task" && (
            <>
              <input
                type="date"
                className="input w-36"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                title="Due date"
              />
              <select
                className="input w-36"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                title="Priority"
              >
                {PRIORITY_LEVELS.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {kind === "task" && priority !== "none" && (
          <div className="flex items-center gap-1.5 text-xxs text-muted">
            <PriorityIcon priority={priority} size={11} />
            <span>{PRIORITY_LABEL[priority]} priority</span>
          </div>
        )}
        {isNote && (
          <>
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              <span>📌 Pin to project — auto-include in agent opening brief</span>
            </label>
            {projectTasks && projectTasks.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="shrink-0">Link to task:</span>
                <select
                  className="input flex-1 !h-7 text-xs"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">— none —</option>
                  {projectTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {project?.key && t.sequenceId ? `${project.key}-${t.sequenceId} · ` : ""}
                      {displayTitle(t)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
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
