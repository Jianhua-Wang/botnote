import { markdown } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import { ChevronLeft, Eye, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useProjectByKey, useSetAgentsMd } from "../api/hooks";
import { ProjectIcon } from "../components/ProjectIcon";

const STARTER = `## Critical
- NEVER commit credentials.
- ALWAYS run tests before commit.

## Stack
- (describe your stack here)

## Conventions
- (idempotent writes, naming, etc.)
`;

export function AgentsMdPage() {
  const { key } = useParams<{ key: string }>();
  const { data: project } = useProjectByKey(key);
  const set = useSetAgentsMd();
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (project) setContent(project.agentsMd);
  }, [project?.id]);

  if (!project) return <div className="p-6 text-sm text-muted">Loading…</div>;

  const dirty = content !== project.agentsMd;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-4 pb-2 flex items-center justify-between border-b border-line bg-surface">
        <div className="flex items-center gap-2 text-sm">
          <Link to={`/p/${project.key}`} className="text-muted hover:text-ink flex items-center gap-1.5">
            <ChevronLeft size={14} />
            <ProjectIcon color={project.color} icon={project.icon} size={12} />
            <span className="font-mono text-xs" style={{ color: project.color }}>
              {project.key}
            </span>
          </Link>
          <span className="text-muted">/</span>
          <div className="flex items-center gap-1.5 text-ink">
            <Settings2 size={14} />
            <span className="font-semibold">AGENTS.md</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-line rounded overflow-hidden">
            <button
              className={`px-2 py-1 text-xs flex items-center gap-1 ${
                mode === "edit" ? "bg-accent text-white" : "bg-surface text-muted hover:bg-sidebar"
              }`}
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
            <button
              className={`px-2 py-1 text-xs flex items-center gap-1 border-l border-line ${
                mode === "preview" ? "bg-accent text-white" : "bg-surface text-muted hover:bg-sidebar"
              }`}
              onClick={() => setMode("preview")}
            >
              <Eye size={11} /> Preview
            </button>
          </div>
          <button
            className="btn btn-primary"
            disabled={!dirty || set.isPending}
            onClick={async () => {
              await set.mutateAsync({ id: project.id, agentsMd: content });
            }}
          >
            <Save size={12} /> {set.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>
      <div className="px-6 pt-2 text-xxs text-muted">
        This text is auto-injected into every agent's opening brief for this project. Keep it short
        (&lt; 200 lines) and imperative.
      </div>

      <div className="flex-1 min-h-0 px-6 pb-6 pt-3">
        {mode === "edit" ? (
          <div className="h-full border border-line rounded bg-surface overflow-hidden">
            <CodeMirror
              value={content}
              onChange={(v) => setContent(v)}
              extensions={[markdown()]}
              placeholder={STARTER}
              height="100%"
              minHeight="100%"
              theme="light"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true
              }}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto scrollbar-thin border border-line rounded bg-surface p-6">
            <div className="prose-sm max-w-2xl text-sm leading-relaxed text-ink space-y-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_code]:bg-sidebar [&_code]:px-1 [&_code]:rounded">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <div className="text-sm text-faint italic">(empty)</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
