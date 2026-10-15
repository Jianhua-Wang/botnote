import { markdown } from "@codemirror/lang-markdown";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Select } from "@cloudflare/kumo/components/select";
import { TagInput } from "@cloudflare/kumo/components/tag-input";
import { cn } from "@cloudflare/kumo/utils";
import {
  CaretRightIcon,
  CheckIcon,
  CloudArrowUpIcon,
  CloudCheckIcon,
  LinkSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
  PushPinIcon,
  TrashIcon,
  XIcon
} from "@phosphor-icons/react";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lineDiff, withContext } from "../lib/lineDiff";
import {
  useConfigureRecurrence,
  useEntity,
  useEntityRevisions,
  useProjects,
  useRecurrence,
  useRelatedEntities,
  useSkipOccurrence,
  useSplitRecurrence,
  useStopRecurrence,
  useUpdateEntity
} from "../api/hooks";
import {
  PRIORITY_LEVELS,
  type Entity,
  type EntityKind,
  type Priority,
  type RecurrenceAnchor,
  type RecurrenceDetails,
  type RecurrenceInput,
  type RecurrencePreset,
  type RecurrenceWeekday
} from "../api/types";
import { useDrawer } from "../hooks/useDrawer";
import { useUndoableDelete } from "../hooks/useUndoableDelete";
import { displayTitle, isUntitled } from "../lib/entityTitle";
import { useModals } from "../state/modals";
import { parseRRule, RECURRENCE_PRESETS, RECURRENCE_WEEKDAYS } from "../lib/rrule";
import { applyRecurrenceScope } from "../lib/recurrenceScope";
import { KindBadge } from "./KindBadge";
import { ProjectIcon } from "./ProjectIcon";
import {
  PriorityIcon,
  PRIORITY_LABEL,
  StatusCircle,
  STATUS_LABEL,
  TASK_STATUS_OPTIONS
} from "./tasks/icons";
import { StatusPickerButton } from "./tasks/StatusPickerButton";
import { TagChip } from "./TagChip";

const AUTOSAVE_DELAY_MS = 600;
const RECURRENCE_LABEL: Record<RecurrencePreset, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly"
};
const RECURRENCE_UNIT: Record<RecurrencePreset, string> = {
  hourly: "hour",
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year"
};

export function EntityDrawer() {
  const { openId, close } = useDrawer();
  const { active: activeModal } = useModals();

  useEffect(() => {
    if (!openId || activeModal) return;
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
  }, [openId, activeModal, close]);

  if (!openId) return null;

  return (
    <div className="fixed inset-0 z-30 flex">
      <div
        className="flex-1 cursor-pointer bg-kumo-recessed/60 backdrop-blur-[1px]"
        onClick={close}
      />
      <aside className="flex w-[min(680px,92vw)] flex-col border-l border-kumo-line bg-kumo-base shadow-modal">
        <DrawerContent id={openId} onClose={close} />
      </aside>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ISO timestamp → value for an <input type="datetime-local"> in the user's timezone.
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DrawerContent({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: entity, isLoading } = useEntity(id);
  const { data: projects } = useProjects();
  const { data: related } = useRelatedEntities(id);
  const { data: parentEntity } = useEntity(entity?.parentId ?? undefined);
  const { data: recurrence } = useRecurrence(entity?.kind === "task" ? id : undefined);
  const update = useUpdateEntity();
  const deleteWithUndo = useUndoableDelete();
  const configureRecurrence = useConfigureRecurrence();
  const skipOccurrence = useSkipOccurrence();
  const stopRecurrence = useStopRecurrence();
  const splitRecurrence = useSplitRecurrence();
  const { open: openModal } = useModals();
  const { open: openDrawer } = useDrawer();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState("open");
  const [dueDate, setDueDate] = useState("");
  const [completedAtStr, setCompletedAtStr] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [occurrenceScope, setOccurrenceScope] = useState<"this" | "future">("future");
  const initializedFor = useRef<string | null>(null);
  // Only send completedAt when the user touched the field — the server
  // auto-stamps it on status transitions, and echoing a stale draft back
  // would clear that stamp.
  const completedAtDirty = useRef(false);

  // Hydrate local draft when the entity ID changes. Don't reset on object identity
  // change to avoid clobbering user input while a save is in flight.
  useEffect(() => {
    if (!entity) return;
    if (initializedFor.current === entity.id) return;
    setTitle(entity.title ?? "");
    setBody(entity.body);
    setTags(entity.tags);
    setStatus(entity.status);
    setDueDate(entity.dueAt ? entity.dueAt.slice(0, 10) : "");
    setCompletedAtStr(toDatetimeLocalValue(entity.completedAt));
    completedAtDirty.current = false;
    setPriority(entity.priority);
    setIsEditing(false);
    setSaveState("idle");
    initializedFor.current = entity.id;
  }, [entity?.id, entity]);

  // Keep the draft in sync when the server stamps completedAt (e.g. marking
  // done auto-fills it) and the user hasn't edited the field themselves.
  useEffect(() => {
    if (!entity || completedAtDirty.current) return;
    setCompletedAtStr(toDatetimeLocalValue(entity.completedAt));
  }, [entity, entity?.completedAt]);

  // Compute the diff between local draft and persisted entity.
  const diff = useMemo(() => {
    if (!isEditing || !entity || initializedFor.current !== entity.id) return null;
    const isNote = entity.kind === "note";
    const trimmedTitle = title.trim();
    const draftTitle = trimmedTitle ? trimmedTitle : isNote ? null : trimmedTitle;

    const out: Record<string, unknown> = {};
    if (draftTitle !== (entity.title ?? "")) {
      // entity.title can be null; draftTitle can be null (note) or "" (other kinds)
      if (!(draftTitle === null && entity.title === null) && draftTitle !== entity.title) {
        out.title = draftTitle === "" ? null : draftTitle;
      }
    }
    if (body !== entity.body) out.body = body;
    if (JSON.stringify(tags) !== JSON.stringify(entity.tags)) out.tags = tags;
    if (status !== entity.status) out.status = status;
    if (priority !== entity.priority) out.priority = priority;
    const currentDueDate = entity.dueAt ? entity.dueAt.slice(0, 10) : "";
    if (dueDate !== currentDueDate) {
      out.dueAt = dueDate ? new Date(dueDate).toISOString() : null;
    }
    // The server only accepts completedAt on a done task.
    if (entity.kind === "task" && status === "done" && completedAtDirty.current) {
      const currentCompleted = toDatetimeLocalValue(entity.completedAt);
      if (completedAtStr !== currentCompleted) {
        out.completedAt = completedAtStr ? new Date(completedAtStr).toISOString() : null;
      }
    }
    return out;
  }, [isEditing, entity, title, body, tags, status, priority, dueDate, completedAtStr]);

  // Whether the entity is a recurring occurrence
  const isRecurringOccurrence =
    entity != null &&
    (entity.metadata?.recurrence as { role?: string } | undefined)?.role === "occurrence";

  // Enhance the diff with recurrenceScope when editing a recurring occurrence's content fields
  function withScope(d: Record<string, unknown>): Record<string, unknown> {
    return applyRecurrenceScope(d, isRecurringOccurrence, occurrenceScope);
  }

  // Debounced auto-save.
  useEffect(() => {
    if (!isEditing || !entity || !diff || Object.keys(diff).length === 0) return;
    setSaveState("idle");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await update.mutateAsync({ id: entity.id, fields: withScope(diff) });
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
      <div className="flex items-center justify-between p-6 text-sm text-kumo-subtle">
        <span className="flex items-center gap-2">
          <Loader size={14} />
          Loading…
        </span>
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<XIcon size={14} />}
          title="Close (Esc)"
          className="text-kumo-subtle"
          onClick={onClose}
        />
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
    setTags(loadedEntity.tags);
    setStatus(loadedEntity.status);
    setDueDate(loadedEntity.dueAt ? loadedEntity.dueAt.slice(0, 10) : "");
    setPriority(loadedEntity.priority);
    setSaveState("idle");
    setOccurrenceScope("future");
    setIsEditing(true);
  }

  async function finishEditing() {
    if (!isDirty || !diff) {
      setIsEditing(false);
      return;
    }
    setSaveState("saving");
    try {
      await update.mutateAsync({ id: loadedEntity.id, fields: withScope(diff) });
      setSaveState("saved");
      setIsEditing(false);
    } catch {
      setSaveState("error");
    }
  }

  async function remove() {
    deleteWithUndo(entity!);
    onClose();
  }

  async function skipCurrentOccurrence() {
    if (!recurrence || !confirm("Skip this recurring occurrence?")) return;
    const result = await skipOccurrence.mutateAsync({ taskId: loadedEntity.id });
    if (result.next) openDrawer(result.next.id);
  }

  async function stopCurrentSeries() {
    if (!recurrence || !confirm("Stop this recurrence series?")) return;
    await stopRecurrence.mutateAsync({ ruleId: recurrence.rule.id });
  }

  async function saveRecurrence(input: RecurrenceInput, firstDueDate: string) {
    if (!firstDueDate) throw new Error("First due date is required");
    const currentDueDate = loadedEntity.dueAt ? loadedEntity.dueAt.slice(0, 10) : "";
    if (firstDueDate !== currentDueDate) {
      await update.mutateAsync({
        id: loadedEntity.id,
        fields: { dueAt: new Date(`${firstDueDate}T12:00:00Z`).toISOString() }
      });
    }
    await configureRecurrence.mutateAsync({ taskId: loadedEntity.id, input });
  }

  async function splitCurrentSeries(input: RecurrenceInput) {
    if (!recurrence) return;
    // The fork point is derived server-side from the current occurrence, so we
    // drop dtstart and reuse the rest of the form input verbatim.
    const { dtstart: _dtstart, ...rest } = input;
    await splitRecurrence.mutateAsync({ ruleId: recurrence.rule.id, input: rest });
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-kumo-line px-3">
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<XIcon size={16} />}
          title="Close (Esc)"
          className="text-kumo-subtle"
          onClick={onClose}
        />
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-kumo-subtle">
          {project && (
            <>
              <Link to={linkPrefix} className="flex items-center gap-1 hover:opacity-80">
                <ProjectIcon color={project.color} icon={project.icon} size={12} />
                <span className="font-mono tabular-nums" style={{ color: project.color }}>
                  {project.key}
                </span>
              </Link>
              <CaretRightIcon size={11} className="shrink-0 text-kumo-placeholder" />
            </>
          )}
          <KindBadge kind={entity.kind as EntityKind} compact />
          {entity.sequenceId && project && (
            <span className="font-mono tabular-nums">
              {project.key}-{entity.sequenceId}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {isEditing && <SaveIndicator state={saveState} dirty={isDirty} />}
          {isNote && (
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              icon={<PushPinIcon size={14} weight={entity.pinned ? "fill" : "regular"} />}
              title={entity.pinned ? "Unpin from opening brief" : "Pin to opening brief"}
              aria-pressed={entity.pinned}
              className={entity.pinned ? "text-kumo-brand" : "text-kumo-subtle"}
              onClick={() =>
                update.mutate({ id: entity.id, fields: { pinned: !entity.pinned } })
              }
            />
          )}
          {isEditing ? (
            <Button size="sm" icon={<CheckIcon size={14} />} onClick={finishEditing}>
              Done
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              icon={<PencilSimpleIcon size={14} />}
              title="Edit"
              className="text-kumo-subtle"
              onClick={startEditing}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={<TrashIcon size={14} />}
            title="Delete"
            className="text-kumo-subtle hover:bg-kumo-danger-tint hover:text-kumo-danger"
            onClick={remove}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-6 py-5 space-y-4">
          {isEditing ? (
            <input
              className={cn(
                "w-full bg-transparent px-0 py-1 text-lg font-semibold text-kumo-default outline-hidden placeholder:text-kumo-placeholder",
                !title && "placeholder:italic"
              )}
              value={title}
              placeholder={isNote ? "Untitled" : "Title"}
              aria-label="Title"
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          ) : (
            <h2
              className={cn(
                "py-1 text-lg font-semibold",
                isUntitled(entity) ? "italic text-kumo-subtle" : "text-kumo-default"
              )}
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
            tags={tags}
            setTags={setTags}
            completedAt={entity.completedAt}
            completedAtStr={completedAtStr}
            setCompletedAtStr={(v) => {
              completedAtDirty.current = true;
              setCompletedAtStr(v);
            }}
            createdAt={entity.createdAt}
            actorKind={entity.actor?.label ?? entity.actorKind}
            task={loadedEntity.kind === "task" ? { ...loadedEntity, status } : undefined}
            onStatusChange={setStatus}
            recurrence={recurrence}
            recurrenceBusy={
              update.isPending ||
              configureRecurrence.isPending ||
              skipOccurrence.isPending ||
              stopRecurrence.isPending ||
              splitRecurrence.isPending
            }
            onSaveRecurrence={saveRecurrence}
            onSkipOccurrence={skipCurrentOccurrence}
            onStopRecurrence={stopCurrentSeries}
            onSplitRecurrence={splitCurrentSeries}
            isRecurringOccurrence={isRecurringOccurrence}
            occurrenceScope={occurrenceScope}
            setOccurrenceScope={setOccurrenceScope}
          />

          {isNote && parentEntity && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-left text-xs transition-colors hover:border-kumo-brand hover:bg-kumo-brand-tint/40"
              onClick={() => openDrawer(parentEntity.id)}
              title="Open linked task"
            >
              <LinkSimpleIcon size={12} className="text-kumo-subtle" />
              <span className="text-kumo-subtle">Linked to task:</span>
              {parentEntity.sequenceId && project && (
                <span className="font-mono tabular-nums text-kumo-subtle">
                  {project.key}-{parentEntity.sequenceId}
                </span>
              )}
              <span className="truncate text-kumo-default">{displayTitle(parentEntity)}</span>
            </button>
          )}

          <div className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-base">
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
              <div className="min-h-[120px] p-3 text-xs text-kumo-placeholder">No description.</div>
            )}
          </div>

          {isEditing && body && (
            <details className="text-xxs text-kumo-subtle">
              <summary className="cursor-pointer hover:text-kumo-default">Preview rendered Markdown</summary>
              <div className="mt-2 rounded-lg border border-kumo-line bg-kumo-recessed p-3">
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

          {entity.kind !== "comment" && <HistorySection entity={entity} />}
        </div>
      </div>
    </>
  );
}

/**
 * Edit history. Revision N is the content BEFORE update N, so the change made
 * by update N is diff(revision N → revision N+1 | current entity).
 */
function HistorySection({ entity }: { entity: import("../api/types").Entity }) {
  const [open, setOpen] = useState(false);
  const revisions = useEntityRevisions(entity.id, { enabled: open });
  const rows = revisions.data ?? [];

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xxs font-semibold uppercase tracking-wider text-kumo-subtle hover:text-kumo-default"
        onClick={() => setOpen((v) => !v)}
      >
        <CaretRightIcon size={12} className={cn("transition-transform", open && "rotate-90")} />
        History
        {open && revisions.data && (
          <span className="font-normal normal-case tracking-normal text-kumo-placeholder">
            {rows.length} edit{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1.5">
          {revisions.isLoading ? (
            <div className="flex justify-center p-3 text-kumo-subtle">
              <Loader size={14} />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-kumo-line p-3 text-center text-xs text-kumo-subtle">
              Never edited since it was written.
            </div>
          ) : (
            <div className="divide-y divide-kumo-hairline overflow-hidden rounded-lg border border-kumo-line">
              {rows.map((rev, idx) => {
                const after = idx === 0 ? entity : rows[idx - 1]!;
                return <RevisionRow key={rev.id} before={rev} after={after} />;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type RevisionContent = Pick<
  import("../api/types").EntityRevision,
  "title" | "body" | "tags" | "priority" | "status"
>;

function RevisionRow({
  before,
  after
}: {
  before: import("../api/types").EntityRevision;
  after: RevisionContent;
}) {
  const fieldChanges: Array<[string, string, string]> = [];
  if ((before.title ?? "") !== (after.title ?? "")) {
    fieldChanges.push(["title", before.title ?? "(untitled)", after.title ?? "(untitled)"]);
  }
  if (before.status !== after.status) fieldChanges.push(["status", before.status, after.status]);
  if (before.priority !== after.priority) fieldChanges.push(["priority", before.priority, after.priority]);
  if (before.tags.join("\u0000") !== after.tags.join("\u0000")) {
    fieldChanges.push(["tags", before.tags.join(", ") || "—", after.tags.join(", ") || "—"]);
  }
  const bodyChanged = before.body !== after.body;
  const diff = useMemo(
    () => (bodyChanged ? withContext(lineDiff(before.body, after.body)) : []),
    [bodyChanged, before.body, after.body]
  );
  const who = before.actor?.label ?? before.actorKind;

  return (
    <div className="px-3 py-2 text-xs">
      <div className="flex items-baseline gap-2 text-xxs text-kumo-subtle">
        <span className="font-mono tabular-nums text-kumo-placeholder">#{before.revision}</span>
        <span>{new Date(before.createdAt).toLocaleString()}</span>
        <span>
          · by <span className="text-kumo-default">{who}</span>
        </span>
      </div>
      {fieldChanges.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {fieldChanges.map(([field, from, to]) => (
            <li key={field} className="text-xxs">
              <span className="text-kumo-subtle">{field}:</span>{" "}
              <span className="text-kumo-danger line-through">{from}</span>{" "}
              <span className="text-kumo-placeholder">→</span>{" "}
              <span className="text-kumo-default">{to}</span>
            </li>
          ))}
        </ul>
      )}
      {bodyChanged && (
        <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-md bg-kumo-recessed p-2 font-mono text-xxs leading-relaxed">
          {diff.map((op, i) =>
            op.type === "skip" ? (
              <div key={i} className="italic text-kumo-placeholder">
                … {op.count} unchanged line{op.count === 1 ? "" : "s"}
              </div>
            ) : (
              <div
                key={i}
                className={
                  op.type === "add"
                    ? "bg-kumo-success-tint text-kumo-default"
                    : op.type === "del"
                      ? "bg-kumo-danger-tint text-kumo-subtle line-through"
                      : "text-kumo-subtle"
                }
              >
                <span className="mr-1 select-none text-kumo-placeholder">
                  {op.type === "add" ? "+" : op.type === "del" ? "−" : " "}
                </span>
                {op.text || " "}
              </div>
            )
          )}
        </pre>
      )}
      {!bodyChanged && fieldChanges.length === 0 && (
        <div className="mt-1 text-xxs text-kumo-placeholder">No visible difference.</div>
      )}
    </div>
  );
}

function recurrenceSummary(details: RecurrenceDetails): string {
  const rule = details.rule;
  const parsed = parseRRule(rule.rrule);
  const preset = parsed.preset ?? "daily";
  const interval = parsed.interval ?? 1;
  const cadence =
    interval > 1
      ? `Every ${interval} ${RECURRENCE_UNIT[preset]}s`
      : RECURRENCE_LABEL[preset];
  const weekdays = parsed.byWeekday.length ? ` · ${parsed.byWeekday.join(", ")}` : "";
  const anchor = rule.anchor === "completion" ? "after completion" : "scheduled";
  const stopped = rule.enabled ? "" : " · stopped";
  const next = rule.nextOccurrenceAt
    ? ` · next ${new Date(rule.nextOccurrenceAt).toLocaleDateString()}`
    : "";
  return `${cadence}${weekdays} · ${anchor}${next}${stopped}`;
}

interface RecurrenceFormState {
  preset: RecurrencePreset | "none";
  interval: number;
  anchor: RecurrenceAnchor;
  byWeekday: RecurrenceWeekday[];
  count: string;
  until: string;
}

function initialRecurrenceForm(recurrence?: RecurrenceDetails): RecurrenceFormState {
  const parsed = recurrence ? parseRRule(recurrence.rule.rrule) : undefined;
  return {
    preset: recurrence ? parsed?.preset ?? "weekly" : "none",
    interval: parsed?.interval ?? 1,
    anchor: recurrence?.rule.anchor ?? "scheduled",
    byWeekday: parsed?.byWeekday ?? [],
    count: parsed?.count ? String(parsed.count) : "",
    until: parsed?.until ?? ""
  };
}

function RepeatMetaValue({
  isEditing,
  task,
  dueDate,
  recurrence,
  onSave,
  onSkip,
  onStop,
  onSplit,
  busy
}: {
  isEditing: boolean;
  task?: Entity;
  dueDate: string;
  recurrence?: RecurrenceDetails;
  onSave?: (input: RecurrenceInput, firstDueDate: string) => Promise<void>;
  onSkip?: () => void;
  onStop?: () => void;
  onSplit?: (input: RecurrenceInput) => Promise<void>;
  busy: boolean;
}) {
  const [form, setForm] = useState<RecurrenceFormState>(() =>
    initialRecurrenceForm(recurrence)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialRecurrenceForm(recurrence));
    setError(null);
  }, [
    isEditing,
    task?.id,
    task?.dueAt,
    recurrence?.rule.id,
    recurrence?.rule.rrule,
    recurrence?.rule.anchor
  ]);

  if (!task) return null;

  const terminal = ["done", "rejected"].includes(task.status);
  const canSkip =
    Boolean(recurrence?.rule.enabled) && recurrence?.rule.currentOccurrenceId === task.id;
  const canStop = Boolean(recurrence?.rule.enabled);
  const repeatEnabled = form.preset !== "none";
  const canSave = Boolean(onSave) && dueDate.length > 0 && repeatEnabled && form.interval >= 1;
  // Split forks an existing active series at its current occurrence — only
  // offered when editing one (not while configuring a brand-new recurrence).
  const canSplit =
    Boolean(onSplit) && Boolean(recurrence?.rule.enabled) && repeatEnabled && form.interval >= 1;

  function updateForm(patch: Partial<RecurrenceFormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setError(null);
  }

  function toggleWeekday(day: RecurrenceWeekday) {
    const set = new Set(form.byWeekday);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    updateForm({ byWeekday: RECURRENCE_WEEKDAYS.filter((d) => set.has(d)) });
  }

  function buildInput(): RecurrenceInput {
    const input: RecurrenceInput = {
      preset: form.preset as RecurrencePreset,
      interval: form.interval,
      anchor: form.anchor,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      allDay: true
    };
    if (form.preset === "weekly" && form.byWeekday.length > 0) {
      input.byWeekday = form.byWeekday;
    }
    if (form.count) input.count = Number(form.count);
    if (form.until) input.until = new Date(`${form.until}T23:59:59Z`).toISOString();
    return input;
  }

  async function save() {
    if (form.preset === "none") {
      setError(null);
      return;
    }
    if (!dueDate) {
      setError("Set due date first");
      return;
    }
    if (form.count && form.until) {
      setError("Use count or until");
      return;
    }
    try {
      await onSave?.(buildInput(), dueDate);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save repeat");
    }
  }

  async function splitSeries() {
    if (form.preset === "none") return;
    if (form.count && form.until) {
      setError("Use count or until");
      return;
    }
    try {
      await onSplit?.(buildInput());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not split series");
    }
  }

  if (!isEditing || terminal) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className={recurrence ? "truncate text-kumo-subtle" : "text-kumo-placeholder"}>
          {recurrence ? recurrenceSummary(recurrence) : "None"}
        </span>
        {canSkip && onSkip && (
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 text-kumo-subtle"
            disabled={busy}
            onClick={onSkip}
          >
            Skip occurrence
          </Button>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <MetaSelect
          label="Repeat"
          value={form.preset}
          onChange={(preset) => updateForm({ preset })}
          options={[
            { value: "none", label: "None" },
            ...RECURRENCE_PRESETS.map((preset) => ({
              value: preset,
              label: RECURRENCE_LABEL[preset]
            }))
          ]}
        />
        {repeatEnabled && (
          <>
            <span className="text-kumo-subtle">every</span>
            <Input
              type="number"
              size="sm"
              min={1}
              max={999}
              aria-label="Interval"
              className="w-14"
              value={form.interval}
              onChange={(e) => updateForm({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="text-kumo-subtle">
              {RECURRENCE_UNIT[form.preset as RecurrencePreset]}
              {form.interval === 1 ? "" : "s"} from
            </span>
            <MetaSelect
              label="Anchor"
              value={form.anchor}
              onChange={(anchor) => updateForm({ anchor })}
              options={[
                { value: "scheduled", label: "Schedule" },
                { value: "completion", label: "Completion" }
              ]}
            />
          </>
        )}
      </span>
      {repeatEnabled && form.preset === "weekly" && (
        <span className="flex flex-wrap gap-1" role="group" aria-label="Weekdays">
          {RECURRENCE_WEEKDAYS.map((day) => {
            const on = form.byWeekday.includes(day);
            return (
              <Button
                key={day}
                size="xs"
                variant={on ? "primary" : "secondary"}
                aria-pressed={on}
                className="w-8 justify-center"
                onClick={() => toggleWeekday(day)}
              >
                {day}
              </Button>
            );
          })}
        </span>
      )}
      {repeatEnabled && (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-kumo-subtle">Ends after</span>
          <Input
            type="number"
            size="sm"
            min={1}
            max={10000}
            aria-label="Count"
            placeholder="∞"
            className="w-16"
            value={form.count}
            onChange={(e) =>
              updateForm({
                count: e.target.value,
                until: e.target.value ? "" : form.until
              })
            }
          />
          <span className="text-kumo-subtle">times, or on</span>
          <Input
            type="date"
            size="sm"
            aria-label="Until"
            className="w-36"
            value={form.until}
            onChange={(e) =>
              updateForm({
                until: e.target.value,
                count: e.target.value ? "" : form.count
              })
            }
          />
        </span>
      )}
      {(repeatEnabled || (canStop && onStop)) && (
        <span className="flex flex-wrap items-center gap-1.5">
          {repeatEnabled && (
            <Button size="xs" variant="primary" disabled={busy || !canSave} onClick={save}>
              {recurrence ? "Update repeat" : "Save repeat"}
            </Button>
          )}
          {canSplit && (
            <Button
              size="xs"
              disabled={busy}
              title="Keep past occurrences on the old cadence; apply this cadence going forward"
              onClick={splitSeries}
            >
              Split series
            </Button>
          )}
          {canStop && onStop && (
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              className="text-kumo-subtle hover:bg-kumo-danger-tint hover:text-kumo-danger"
              onClick={onStop}
            >
              Stop series
            </Button>
          )}
          {repeatEnabled && !dueDate && (
            <span className="text-xxs text-kumo-placeholder">Set due date first</span>
          )}
          {error && <span className="truncate text-xxs text-kumo-danger">{error}</span>}
        </span>
      )}
    </span>
  );
}

function MetaSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  className
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  className?: string;
}) {
  const byValue = new Map(options.map((o) => [o.value, o]));
  return (
    <Select<T>
      size="sm"
      aria-label={label}
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      renderValue={(v) => <OptionLabel icon={byValue.get(v)?.icon} label={byValue.get(v)?.label ?? v} />}
      className={cn("min-w-28", className)}
    >
      {options.map((o) => (
        <Select.Option key={o.value} value={o.value} className="py-1 text-sm">
          <OptionLabel icon={o.icon} label={o.label} />
        </Select.Option>
      ))}
    </Select>
  );
}

function OptionLabel({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {icon}
      <span className="truncate">{label}</span>
    </span>
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
  tags,
  setTags,
  completedAt,
  completedAtStr,
  setCompletedAtStr,
  createdAt,
  actorKind,
  task,
  onStatusChange,
  recurrence,
  recurrenceBusy,
  onSaveRecurrence,
  onSkipOccurrence,
  onStopRecurrence,
  onSplitRecurrence,
  isRecurringOccurrence,
  occurrenceScope,
  setOccurrenceScope
}: {
  isEditing: boolean;
  isTask: boolean;
  status: string;
  setStatus: (s: string) => void;
  dueDate: string;
  setDueDate: (d: string) => void;
  priority: Priority;
  setPriority: (p: Priority) => void;
  tags: string[];
  setTags: (tags: string[]) => void;
  completedAt: string | null;
  completedAtStr: string;
  setCompletedAtStr: (v: string) => void;
  createdAt: string;
  actorKind: string;
  task?: Entity;
  onStatusChange?: (status: string) => void;
  recurrence?: RecurrenceDetails;
  recurrenceBusy?: boolean;
  onSaveRecurrence?: (input: RecurrenceInput, firstDueDate: string) => Promise<void>;
  onSkipOccurrence?: () => void;
  onStopRecurrence?: () => void;
  onSplitRecurrence?: (input: RecurrenceInput) => Promise<void>;
  isRecurringOccurrence?: boolean;
  occurrenceScope?: "this" | "future";
  setOccurrenceScope?: (scope: "this" | "future") => void;
}) {
  return (
    <div className="grid auto-rows-[minmax(26px,auto)] grid-cols-[80px_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
      {isTask && (
        <>
          <MetaLabel>Status</MetaLabel>
          <span className="flex min-w-0 items-center gap-1.5">
            {isEditing ? (
              <MetaSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={TASK_STATUS_OPTIONS.map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s] ?? s,
                  icon: <StatusCircle status={s} size={12} />
                }))}
              />
            ) : (
              <>
                {task ? (
                  <StatusPickerButton task={task} size={12} onStatusChange={onStatusChange} />
                ) : (
                  <StatusCircle status={status} size={12} />
                )}
                <span className="text-kumo-default">{STATUS_LABEL[status] ?? status}</span>
              </>
            )}
          </span>

          <MetaLabel>Due</MetaLabel>
          <span className="flex min-w-0 items-center gap-1.5">
            {isEditing ? (
              <>
                <Input
                  type="date"
                  size="sm"
                  aria-label="Due date"
                  className="w-36"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                {dueDate ? (
                  <ClearButton label="Clear due date" onClick={() => setDueDate("")} />
                ) : (
                  <MetaHint>inbox</MetaHint>
                )}
              </>
            ) : (
              <span className={dueDate ? "tabular-nums text-kumo-default" : "text-kumo-placeholder"}>
                {dueDate || "inbox"}
              </span>
            )}
          </span>

          {(recurrence || (isEditing && task && !["done", "rejected"].includes(status))) && (
            <>
              <MetaLabel top={isEditing}>Repeat</MetaLabel>
              <RepeatMetaValue
                isEditing={isEditing}
                task={task}
                dueDate={dueDate}
                recurrence={recurrence}
                busy={Boolean(recurrenceBusy)}
                onSave={onSaveRecurrence}
                onSkip={onSkipOccurrence}
                onStop={onStopRecurrence}
                onSplit={onSplitRecurrence}
              />
            </>
          )}

          {isEditing && isRecurringOccurrence && (
            <>
              <MetaLabel>Apply to</MetaLabel>
              <span className="flex min-w-0 items-center gap-1.5">
                <MetaSelect
                  label="Recurrence edit scope"
                  value={occurrenceScope ?? "future"}
                  onChange={(scope) => setOccurrenceScope?.(scope)}
                  className="min-w-40"
                  options={[
                    { value: "future", label: "This and future" },
                    { value: "this", label: "This occurrence only" }
                  ]}
                />
              </span>
            </>
          )}

          <MetaLabel>Priority</MetaLabel>
          <span className="flex min-w-0 items-center gap-1.5">
            {isEditing ? (
              <MetaSelect
                label="Priority"
                value={priority}
                onChange={setPriority}
                options={PRIORITY_LEVELS.map((p) => ({
                  value: p,
                  label: PRIORITY_LABEL[p],
                  icon: <PriorityIcon priority={p} size={12} />
                }))}
              />
            ) : (
              <>
                <PriorityIcon priority={priority} size={12} />
                <span className="text-kumo-default">{PRIORITY_LABEL[priority]}</span>
              </>
            )}
          </span>

          {status === "done" && (
            <>
              <MetaLabel>Completed</MetaLabel>
              {isEditing ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Input
                    type="datetime-local"
                    size="sm"
                    aria-label="Completed at"
                    className="w-48"
                    value={completedAtStr}
                    onChange={(e) => setCompletedAtStr(e.target.value)}
                  />
                  {completedAtStr ? (
                    <ClearButton label="Clear completed time" onClick={() => setCompletedAtStr("")} />
                  ) : (
                    <MetaHint>auto</MetaHint>
                  )}
                </span>
              ) : (
                <span className="text-kumo-subtle">
                  {completedAt ? new Date(completedAt).toLocaleString() : "Not recorded"}
                </span>
              )}
            </>
          )}
        </>
      )}

      <MetaLabel>Tags</MetaLabel>
      {isEditing ? (
        <TagInput
          aria-label="Tags"
          value={tags}
          onValueChange={setTags}
          placeholder={tags.length ? "" : "Add tag…"}
          className="min-h-6.5 gap-x-1 gap-y-1 px-1 py-0.5 text-xs [&>span]:h-5 [&>span]:text-xs"
        />
      ) : tags.length ? (
        <span className="flex min-w-0 flex-wrap gap-1">
          {tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </span>
      ) : (
        <span className="text-kumo-placeholder">none</span>
      )}

      <MetaLabel>Created</MetaLabel>
      <span className="text-kumo-subtle">
        {new Date(createdAt).toLocaleString()} · by{" "}
        <span className="text-kumo-default">{actorKind}</span>
      </span>
    </div>
  );
}

function MetaLabel({ children, top = false }: { children: ReactNode; top?: boolean }) {
  return (
    <span className={cn("text-kumo-subtle", top && "self-start leading-6.5")}>{children}</span>
  );
}

function MetaHint({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-kumo-placeholder">{children}</span>;
}

function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      shape="square"
      icon={<XIcon size={12} />}
      aria-label={label}
      className="size-5 text-kumo-subtle hover:text-kumo-danger"
      onClick={onClick}
    />
  );
}

function SaveIndicator({ state, dirty }: { state: SaveState; dirty: boolean }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-xxs text-kumo-subtle">
        <Loader size={11} />
        Saving…
      </span>
    );
  }
  if (state === "saved" && !dirty) {
    return (
      <span className="flex items-center gap-1 text-xxs text-kumo-placeholder">
        <CloudCheckIcon size={12} />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-xxs text-kumo-danger">Save failed</span>;
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1 text-xxs text-kumo-placeholder">
        <CloudArrowUpIcon size={12} />
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
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xxs font-semibold uppercase tracking-wider text-kumo-subtle">
          Related notes <span className="text-kumo-placeholder">{notes.length}</span>
        </h3>
        <Button
          variant="ghost"
          size="xs"
          icon={<PlusIcon size={12} />}
          className="text-kumo-link"
          onClick={onAdd}
        >
          Add note
        </Button>
      </div>
      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-kumo-line p-3 text-center text-xs text-kumo-placeholder">
          No linked notes yet.
        </div>
      ) : (
        <div className="divide-y divide-kumo-hairline overflow-hidden rounded-lg border border-kumo-line">
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-kumo-tint"
              onClick={() => onOpen(n.id)}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate text-sm",
                    isUntitled(n) ? "italic text-kumo-subtle" : "text-kumo-default"
                  )}
                >
                  {displayTitle(n)}
                </div>
                {!isUntitled(n) && n.body && (
                  <div className="mt-0.5 truncate text-xxs text-kumo-subtle">
                    {n.body.replace(/\n/g, " ").slice(0, 140)}
                  </div>
                )}
              </div>
              {n.pinned && (
                <PushPinIcon size={12} weight="fill" className="mt-1 shrink-0 text-kumo-brand" />
              )}
            </button>
          ))}
        </div>
      )}
      {!project && (
        <div className="mt-1 text-xxs text-kumo-placeholder">
          No project context — link picker unavailable.
        </div>
      )}
    </div>
  );
}

function MarkdownView({ body }: { body: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-kumo-default [&_a]:text-kumo-link [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-kumo-line [&_blockquote]:pl-3 [&_blockquote]:text-kumo-subtle [&_code]:rounded [&_code]:bg-kumo-fill [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-kumo-recessed [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:border-collapse [&_td]:border [&_td]:border-kumo-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-kumo-line [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
