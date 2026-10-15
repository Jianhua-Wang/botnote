import { Button } from "@cloudflare/kumo/components/button";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { markdown } from "@codemirror/lang-markdown";
import { CaretLeftIcon, EyeIcon, FloppyDiskIcon, PencilSimpleIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useProjectByKey, useSetAgentsMd } from "../api/hooks";
import { ProjectIcon } from "../components/ProjectIcon";
import { useEditorTheme } from "../hooks/useEditorTheme";

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
  const editorTheme = useEditorTheme();

  useEffect(() => {
    if (project) setContent(project.agentsMd);
  }, [project?.id]);

  if (!project) return <div className="p-6 text-sm text-kumo-subtle">Loading…</div>;

  const dirty = content !== project.agentsMd;

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 px-4 md:px-6 flex items-center justify-between gap-2 border-b border-kumo-line bg-kumo-base shrink-0">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link to={`/p/${project.key}`} className="text-kumo-subtle hover:text-kumo-default flex items-center gap-1.5">
            <CaretLeftIcon size={14} />
            <ProjectIcon color={project.color} icon={project.icon} size={12} />
            <span className="font-mono text-xs" style={{ color: project.color }}>
              {project.key}
            </span>
          </Link>
          <span className="text-kumo-subtle">/</span>
          <div className="flex items-center gap-1.5 text-kumo-default">
            <SlidersHorizontalIcon size={14} />
            <span className="font-semibold">AGENTS.md</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            variant="segmented"
            size="sm"
            value={mode}
            onValueChange={(v) => setMode(v as "edit" | "preview")}
            tabs={[
              {
                value: "edit",
                label: (
                  <span className="flex items-center gap-1">
                    <PencilSimpleIcon size={12} /> Edit
                  </span>
                )
              },
              {
                value: "preview",
                label: (
                  <span className="flex items-center gap-1">
                    <EyeIcon size={12} /> Preview
                  </span>
                )
              }
            ]}
          />
          <Button
            variant="primary"
            size="sm"
            icon={<FloppyDiskIcon size={12} />}
            loading={set.isPending}
            disabled={!dirty || set.isPending}
            onClick={async () => {
              await set.mutateAsync({ id: project.id, agentsMd: content });
            }}
          >
            {set.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>
      <div className="px-4 md:px-6 pt-2 text-xxs text-kumo-subtle">
        This text is auto-injected into every agent's opening brief for this project. Keep it short
        (&lt; 200 lines) and imperative.
      </div>

      <div className="flex-1 min-h-0 px-4 md:px-6 pb-6 pt-3">
        {mode === "edit" ? (
          <div className="h-full border border-kumo-line rounded-lg bg-kumo-base overflow-hidden">
            <CodeMirror
              value={content}
              onChange={(v) => setContent(v)}
              extensions={[markdown()]}
              placeholder={STARTER}
              height="100%"
              minHeight="100%"
              theme={editorTheme}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true
              }}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto scrollbar-thin border border-kumo-line rounded-lg bg-kumo-base p-6">
            <div className="prose-sm max-w-2xl text-sm leading-relaxed text-kumo-default space-y-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_code]:bg-kumo-tint [&_code]:px-1 [&_code]:rounded">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <div className="text-sm text-kumo-placeholder italic">(empty)</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
