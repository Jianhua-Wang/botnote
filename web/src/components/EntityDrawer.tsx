import { markdown } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import {
  Check,
  ChevronRight,
  Cloud,
  CloudUpload,
  Link2,
  Loader2,
  Pencil,
  Pin,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useDeleteEntity,
  useEntity,
  useProjects,
  useRelatedEntities,
  useUpdateEntity
} from "../api/hooks";
import { PRIORITY_LEVELS, type EntityKind, type Priority } from "../api/types";
import { useDrawer } from "../hooks/useDrawer";
import { displayTitle, isUntitled } from "../lib/entityTitle";
import { useModals } from "../state/modals";
import { KindBadge } from "./KindBadge";
import { ProjectIcon } from "./ProjectIcon";
import {
  PriorityIcon,
  PRIORITY_LABEL,
  StatusCircle,
  STATUS_LABEL,
  TASK_STATUS_OPTIONS
} from "./tasks/icons";

const AUTOSAVE_DELAY_MS = 600;

export function EntityDrawer() {
  const { openId, close } = useDrawer();

  useEffect(() => {
    if (!openId) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.closest(".cm-editor"))) {
        // Let inputs handle Esc themselves (blur via default + our handler blurs the element below).
        (t as HTMLElement).blur();
        return;
      }
      close();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [openId, close]);

  if (!openId) return null;

  return (
    <div className="fixed inset-0 z-30 flex">
      <div
        className="flex-1 bg-ink/10 backdrop-blur-[1px] cursor-pointer"
        onClick={close}
      />
      <aside className="w-[min(680px,92vw)] bg-surface border-l border-line shadow-modal flex flex-col">
        <DrawerContent id={openId} onClose={close} />
      </aside>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

function DrawerContent({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: entity, isLoading } = useEntity(id);
  const { data: projects } = useProjects();
  const { data: related } = useRelatedEntities(id);
  const { data: parentEntity } = useEntity(entity?.parentId ?? undefined);
  const update = useUpdateEntity();
  const del = useDeleteEntity();
  const { open: openModal } = useModals();
  const { open: openDrawer } = useDrawer();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [status, setStatus] = useState("open");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const initializedFor = useRef<string | null>(null);

  // Hydrate local draft when the entity ID changes. Don't reset on object identity
  // change to avoid clobbering user input while a save is in flight.
  useEffect(() => {
    if (!entity) return;
    if (initializedFor.current === entity.id) return;
    setTitle(entity.title ?? "");
    setBody(entity.body);
    setTagsStr(entity.tags.join(", "));
    setStatus(entity.status);
    setDueDate(entity.dueAt ? entity.dueAt.slice(0, 10) : "");
    setPriority(entity.priority);
    setIsEditing(false);
    setSaveState("idle");
    initializedFor.current = entity.id;
  }, [entity?.id, entity]);

  // Compute the diff between local draft and persisted entity.
  const diff = useMemo(() => {
    if (!isEditing || !entity || initializedFor.current !== entity.id) return null;
    const isNote = entity.kind === "note";
    const trimmedTitle = title.trim();
    const draftTitle = trimmedTitle ? trimmedTitle : isNote ? null : trimmedTitle;
    const draftTags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);

    const out: Record<string, unknown> = {};
    if (draftTitle !== (entity.title ?? "")) {
      // entity.title can be null; draftTitle can be null (note) or "" (other kinds)
      if (!(draftTitle === null && entity.title === null) && draftTitle !== entity.title) {
        out.title = draftTitle === "" ? null : draftTitle;
      }
    }
    if (body !== entity.body) out.body = body;
    if (JSON.stringify(draftTags) !== JSON.stringify(entity.tags)) out.tags = draftTags;
    if (status !== entity.status) out.status = status;
    if (priority !== entity.priority) out.priority = priority;
    const currentDueDate = entity.dueAt ? entity.dueAt.slice(0, 10) : "";
    if (dueDate !== currentDueDate) {
      out.dueAt = dueDate ? new Date(dueDate).toISOString() : null;
    }
    return out;
  }, [isEditing, entity, title, body, tagsStr, status, priority, dueDate]);

  // Debounced auto-save.
  useEffect(() => {
    if (!isEditing || !entity || !diff || Object.keys(diff).length === 0) return;
    setSaveState("idle");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await update.mutateAsync({ id: entity.id, fields: diff });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, diff]);

  if (isLoading || !entity) {
    return (
      <div className="p-6 text-sm text-muted flex items-center justify-between">
        <span>Loading…</span>
        <button onClick={onClose} className="text-faint hover:text-ink">
          <X size={14} />
        </button>
      </div>
    );
  }

  const loadedEntity = entity;
  const project = projects?.find((p) => p.id === loadedEntity.projectId);
  const linkPrefix = project ? `/p/${project.key}` : "";
  const isNote = loadedEntity.kind === "note";
  const isDirty = diff ? Object.keys(diff).length > 0 : false;

  function startEditing() {
    setTitle(loadedEntity.title ?? "");
    setBody(loadedEntity.body);
    setTagsStr(loadedEntity.tags.join(", "));
    setStatus(loadedEntity.status);
    setDueDate(loadedEntity.dueAt ? loadedEntity.dueAt.slice(0, 10) : "");
    setPriority(loadedEntity.priority);
    setSaveState("idle");
    setIsEditing(true);
  }

  async function finishEditing() {
    if (!isDirty || !diff) {
      setIsEditing(false);
      return;
    }
    setSaveState("saving");
    try {
      await update.mutateAsync({ id: loadedEntity.id, fields: diff });
      setSaveState("saved");
      setIsEditing(false);
    } catch {
      setSaveState("error");
    }
  }

  async function remove() {
    if (!confirm(`Delete "${displayTitle(entity!)}"? This cannot be undone.`)) return;
    await del.mutateAsync(entity!.id);
    onClose();
  }

  return (
    <>
      <header className="h-12 px-3 border-b border-line flex items-center gap-2 shrink-0">
        <button
          onClick={onClose}
          className="p-1 -m-1 text-faint hover:text-ink rounded hover:bg-sidebar"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
        <div className="flex items-center gap-1.5 text-xs text-muted min-w-0">
          {project && (
            <>
              <Link to={linkPrefix} className="flex items-center gap-1 hover:opacity-80">
                <ProjectIcon color={project.color} icon={project.icon} size={12} />
                <span className="font-mono tabular-nums" style={{ color: project.color }}>
                  {project.key}
                </span>
              </Link>
              <ChevronRight size={11} className="text-faint shrink-0" />
            </>
          )}
          <KindBadge kind={entity.kind as EntityKind} compact />
          {entity.sequenceId && project && (
            <span className="font-mono text-faint tabular-nums">
              {project.key}-{entity.sequenceId}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isEditing && <SaveIndicator state={saveState} dirty={isDirty} />}
          {isNote && (
            <button
              className={`p-1 -m-1 rounded hover:bg-sidebar ${
                entity.pinned ? "text-accent" : "text-faint hover:text-ink"
              }`}
              onClick={() =>
                update.mutate({ id: entity.id, fields: { pinned: !entity.pinned } })
              }
              title={entity.pinned ? "Unpin from opening brief" : "Pin to opening brief"}
            >
              <Pin size={13} fill={entity.pinned ? "currentColor" : "none"} />
            </button>
          )}
          {isEditing ? (
            <button
              className="p-1 -m-1 text-faint hover:text-ink rounded hover:bg-sidebar"
              onClick={finishEditing}
              title="Finish editing"
            >
              <Check size={13} />
            </button>
          ) : (
            <button
              className="p-1 -m-1 text-faint hover:text-ink rounded hover:bg-sidebar"
              onClick={startEditing}
              title="Edit"
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            className="p-1 -m-1 text-faint hover:text-danger rounded hover:bg-danger/10"
            onClick={remove}
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-6 py-5 space-y-4">
          {isEditing ? (
            <input
              className={`w-full text-lg font-semibold bg-transparent border-none outline-none focus:outline-none px-0 py-1 ${
                !title ? "placeholder:text-muted/60 placeholder:italic" : ""
              }`}
              value={title}
              placeholder={isNote ? "Untitled" : "Title"}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          ) : (
            <h2
              className={`text-lg font-semibold py-1 ${
                isUntitled(entity) ? "italic text-muted" : "text-ink"
              }`}
            >
              {displayTitle(entity)}
            </h2>
          )}

          <MetaRow
            isEditing={isEditing}
            isTask={entity.kind === "task"}
            status={status}
            setStatus={setStatus}
            dueDate={dueDate}
            setDueDate={setDueDate}
            priority={priority}
            setPriority={setPriority}
            tagsStr={tagsStr}
            setTagsStr={setTagsStr}
            completedAt={entity.completedAt}
            createdAt={entity.createdAt}
            actorKind={entity.actorKind}
          />

          {isNote && parentEntity && (
            <button
              className="w-full text-left flex items-center gap-2 text-xs px-3 py-2 rounded border border-line bg-sidebar/50 hover:border-accent hover:bg-accentSoft/40 transition-colors"
              onClick={() => openDrawer(parentEntity.id)}
              title="Open linked task"
            >
              <Link2 size={12} className="text-faint" />
              <span className="text-faint">Linked to task:</span>
              {parentEntity.sequenceId && project && (
                <span className="font-mono text-faint tabular-nums">
                  {project.key}-{parentEntity.sequenceId}
                </span>
              )}
              <span className="text-ink truncate">{displayTitle(parentEntity)}</span>
            </button>
          )}

          <div className="border border-line rounded-md overflow-hidden bg-surface">
            {isEditing ? (
              <CodeMirror
                value={body}
                onChange={(v) => setBody(v)}
                extensions={[markdown()]}
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                  highlightActiveLineGutter: false
                }}
                theme="light"
                minHeight="220px"
                placeholder="Write in Markdown…"
              />
            ) : body ? (
              <div className="min-h-[120px] p-3">
                <MarkdownView body={body} />
              </div>
            ) : (
              <div className="min-h-[120px] p-3 text-xs text-faint">No description.</div>
            )}
          </div>

          {isEditing && body && (
            <details className="text-xxs text-muted">
              <summary className="cursor-pointer hover:text-ink">Preview rendered Markdown</summary>
              <div className="mt-2 p-3 border border-line rounded bg-sidebar/30">
                <MarkdownView body={body} />
              </div>
            </details>
          )}

          {entity.kind === "task" && (
            <RelatedNotesSection
              related={related ?? []}
              onOpen={openDrawer}
              onAdd={() => {
                if (!project) return;
                openModal({
                  kind: "quick-create",
                  projectId: project.id,
                  initialKind: "note",
                  parentId: entity.id
                });
              }}
              project={project}
            />
          )}
        </div>
      </div>
    </>
  );
}

function MetaRow({
  isEditing,
  isTask,
  status,
  setStatus,
  dueDate,
  setDueDate,
  priority,
  setPriority,
  tagsStr,
  setTagsStr,
  completedAt,
  createdAt,
  actorKind
}: {
  isEditing: boolean;
  isTask: boolean;
  status: string;
  setStatus: (s: string) => void;
  dueDate: string;
  setDueDate: (d: string) => void;
  priority: Priority;
  setPriority: (p: Priority) => void;
  tagsStr: string;
  setTagsStr: (s: string) => void;
  completedAt: string | null;
  createdAt: string;
  actorKind: string;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 items-center text-xs">
      {isTask && (
        <>
          <span className="text-faint">Status</span>
          <span className="flex items-center gap-1.5">
            <StatusCircle status={status} size={12} />
            {isEditing ? (
              <select
                className="bg-transparent border-none text-xs text-ink hover:bg-sidebar rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-accent"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {TASK_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-ink">{STATUS_LABEL[status] ?? status}</span>
            )}
          </span>

          <span className="text-faint">Due</span>
          <span className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                <input
                  type="date"
                  className="bg-transparent border-none text-xs text-ink hover:bg-sidebar rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-accent"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                {!dueDate && <span className="text-faint text-xxs">inbox</span>}
                {dueDate && (
                  <button
                    className="text-faint hover:text-danger text-xxs"
                    onClick={() => setDueDate("")}
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </>
            ) : (
              <span className={dueDate ? "text-ink" : "text-faint text-xxs"}>
                {dueDate || "inbox"}
              </span>
            )}
          </span>

          <span className="text-faint">Priority</span>
          <span className="flex items-center gap-1.5">
            <PriorityIcon priority={priority} size={12} />
            {isEditing ? (
              <select
                className="bg-transparent border-none text-xs text-ink hover:bg-sidebar rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-accent"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITY_LEVELS.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-ink">{PRIORITY_LABEL[priority]}</span>
            )}
          </span>

          {status === "done" && (
            <>
              <span className="text-faint">Completed</span>
              <span className="text-muted">
                {completedAt ? new Date(completedAt).toLocaleString() : "Not recorded"}
              </span>
            </>
          )}
        </>
      )}

      <span className="text-faint">Tags</span>
      {isEditing ? (
        <input
          className="bg-transparent border-none text-xs text-ink hover:bg-sidebar rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-accent"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="comma, separated"
        />
      ) : (
        <span className={tagsStr ? "text-muted" : "text-faint"}>
          {tagsStr || "none"}
        </span>
      )}

      <span className="text-faint">Created</span>
      <span className="text-muted">
        {new Date(createdAt).toLocaleString()} · <span className="text-ink">{actorKind}</span>
      </span>
    </div>
  );
}

function SaveIndicator({ state, dirty }: { state: SaveState; dirty: boolean }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-xxs text-muted">
        <Loader2 size={11} className="animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === "saved" && !dirty) {
    return (
      <span className="flex items-center gap-1 text-xxs text-faint">
        <Cloud size={11} />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-xxs text-danger">Save failed</span>;
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1 text-xxs text-faint">
        <CloudUpload size={11} />
        Unsaved
      </span>
    );
  }
  return null;
}

function RelatedNotesSection({
  related,
  onOpen,
  onAdd,
  project
}: {
  related: import("../api/types").Entity[];
  onOpen: (id: string) => void;
  onAdd: () => void;
  project?: import("../api/types").Project;
}) {
  const notes = related.filter((r) => r.kind === "note");
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-xxs uppercase tracking-wider text-muted font-semibold">
          Related notes <span className="text-faint">{notes.length}</span>
        </h3>
        <button onClick={onAdd} className="text-xs text-accent hover:underline">
          + Add note
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="text-xs text-faint border border-dashed border-line rounded p-3 text-center">
          No linked notes yet.
        </div>
      ) : (
        <div className="border border-line rounded-md divide-y divide-lineSoft overflow-hidden">
          {notes.map((n) => (
            <button
              key={n.id}
              className="w-full text-left px-3 py-2 hover:bg-sidebar flex items-start gap-2"
              onClick={() => onOpen(n.id)}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${isUntitled(n) ? "italic text-muted" : "text-ink"}`}>
                  {displayTitle(n)}
                </div>
                {!isUntitled(n) && n.body && (
                  <div className="text-xxs text-muted truncate mt-0.5">
                    {n.body.replace(/\n/g, " ").slice(0, 140)}
                  </div>
                )}
              </div>
              {n.pinned && <Pin size={11} className="text-accent shrink-0 mt-1" fill="currentColor" />}
            </button>
          ))}
        </div>
      )}
      {!project && (
        <div className="text-xxs text-faint mt-1">No project context — link picker unavailable.</div>
      )}
    </div>
  );
}

function MarkdownView({ body }: { body: string }) {
  return (
    <div className="text-sm leading-relaxed text-ink space-y-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:font-semibold [&_h3]:mt-2 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:bg-sidebar [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-sidebar [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_table]:border-collapse [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
