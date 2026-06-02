import { markdown } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import { ChevronLeft, Edit3, Eye, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEntity, useEntityList, useOpeningBrief, useProjectByKey, useUpdateEntity } from "../api/hooks";
import type { EntityKind } from "../api/types";
import { KindBadge } from "../components/KindBadge";

const STATUS_OPTIONS = ["open", "in_progress", "done", "archived", "rejected"];

export function EntityDetailPage() {
  const { key, id } = useParams<{ key: string; id: string }>();
  const { data: project } = useProjectByKey(key);
  const { data: entity, isLoading } = useEntity(id);
  const update = useUpdateEntity();
  const { data: openingBrief } = useOpeningBrief(project?.id, { poll: false });
  const { data: siblings } = useEntityList(project?.id, entity ? [entity.kind] : null);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [status, setStatus] = useState("open");

  useEffect(() => {
    if (entity) {
      setTitle(entity.title);
      setBody(entity.body);
      setTagsStr(entity.tags.join(", "));
      setStatus(entity.status);
      setEditing(false);
    }
  }, [entity?.id]);

  const dirty = useMemo(() => {
    if (!entity) return false;
    return (
      title !== entity.title ||
      body !== entity.body ||
      tagsStr !==
        entity.tags.join(", ") ||
      status !== entity.status
    );
  }, [entity, title, body, tagsStr, status]);

  if (isLoading || !entity) {
    return <div className="p-6 text-sm text-muted">Loading entity…</div>;
  }

  const linkPrefix = `/p/${key}`;

  async function save() {
    await update.mutateAsync({
      id: entity!.id,
      fields: {
        title: title.trim(),
        body,
        tags: tagsStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        status
      }
    });
    setEditing(false);
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Link to={linkPrefix} className="hover:text-ink flex items-center gap-1">
            <ChevronLeft size={13} />
            <span className="font-mono">{project?.key}</span>
          </Link>
          <span>/</span>
          <KindBadge kind={entity.kind as EntityKind} compact />
          <span className="font-mono text-faint">{entity.id.slice(0, 8)}</span>
        </div>

        <div className="bg-surface border border-line rounded-md">
          <div className="px-4 pt-3 pb-2 flex items-start gap-3">
            {editing ? (
              <input
                className="input !h-auto py-1 text-base font-semibold flex-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            ) : (
              <h1 className="text-base font-semibold flex-1">{entity.title}</h1>
            )}
            <div className="flex gap-1">
              {!editing ? (
                <button className="btn" onClick={() => setEditing(true)}>
                  <Edit3 size={12} /> Edit
                </button>
              ) : (
                <>
                  <button
                    className="btn"
                    onClick={() => {
                      setEditing(false);
                      setTitle(entity.title);
                      setBody(entity.body);
                      setTagsStr(entity.tags.join(", "));
                      setStatus(entity.status);
                    }}
                  >
                    <X size={12} /> Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={!dirty || update.isPending}
                    onClick={save}
                  >
                    <Save size={12} /> Save
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="px-4 pb-3 flex flex-wrap gap-2 items-center text-xxs text-muted">
            <span>Status:</span>
            {editing ? (
              <select
                className="input !h-6 !w-auto !py-0 text-xxs"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <span className="chip">{entity.status}</span>
            )}
            <span>·</span>
            <span>Tags:</span>
            {editing ? (
              <input
                className="input !h-6 !w-64 text-xxs"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="comma, separated"
              />
            ) : entity.tags.length ? (
              <div className="flex gap-1">
                {entity.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-faint">—</span>
            )}
            <span>·</span>
            <span>
              by <span className="text-ink">{entity.actorKind}</span> · created{" "}
              {new Date(entity.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-md">
          <div className="px-3 py-1.5 border-b border-line flex items-center justify-between text-xxs text-muted">
            <div className="flex items-center gap-2">
              {editing ? <Edit3 size={11} /> : <Eye size={11} />}
              <span>{editing ? "Editing (Markdown)" : "Body"}</span>
            </div>
            {entity.bodyVec && (
              <span className="text-faint">vector indexed · 384-dim</span>
            )}
          </div>
          {editing ? (
            <div className="text-sm">
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
              />
            </div>
          ) : (
            <div className="px-4 py-3 prose-sm">
              {entity.body ? (
                <ReactMarkdownClient body={entity.body} />
              ) : (
                <div className="text-sm text-faint italic">(empty body)</div>
              )}
            </div>
          )}
        </div>

        {siblings && siblings.length > 1 && (
          <div className="text-xxs text-muted">
            {siblings.length} {entity.kind}s in {project?.key} · {openingBrief?.openTasks.length ?? 0}{" "}
            open tasks
          </div>
        )}
      </div>
    </div>
  );
}

function ReactMarkdownClient({ body }: { body: string }) {
  return (
    <div className="text-sm leading-relaxed text-ink space-y-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:font-semibold [&_h3]:mt-2 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:bg-sidebar [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-sidebar [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_table]:border-collapse [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
