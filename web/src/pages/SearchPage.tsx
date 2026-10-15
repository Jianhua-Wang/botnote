import { format } from "date-fns";
import { Input } from "@cloudflare/kumo/components/input";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useProjects, useSearch } from "../api/hooks";
import type { EntityKind } from "../api/types";
import { ENTITY_KINDS } from "../api/types";
import { KindBadge } from "../components/KindBadge";
import { projectLookup } from "../components/tasks/utils";
import { useDrawer } from "../hooks/useDrawer";
import { displayTitle, isUntitled } from "../lib/entityTitle";

const SNIPPET_RADIUS = 90;

/** Center the snippet on the first query-term hit and mark all matches. */
function Snippet({ body, query }: { body: string; query: string }) {
  const text = body.replace(/\s+/g, " ").trim();
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const lower = text.toLowerCase();
  let hitAt = -1;
  let hitLen = 0;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx >= 0 && (hitAt === -1 || idx < hitAt)) {
      hitAt = idx;
      hitLen = term.length;
    }
  }

  let start = 0;
  let end = Math.min(text.length, SNIPPET_RADIUS * 2);
  if (hitAt >= 0) {
    start = Math.max(0, hitAt - SNIPPET_RADIUS);
    end = Math.min(text.length, hitAt + hitLen + SNIPPET_RADIUS);
  }
  const slice = text.slice(start, end);

  const nodes: ReactNode[] = [];
  if (terms.length === 0) {
    nodes.push(slice);
  } else {
    const pattern = new RegExp(
      `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "gi"
    );
    slice.split(pattern).forEach((part, i) => {
      if (i % 2 === 1) {
        nodes.push(
          <mark key={i} className="bg-kumo-warning-tint text-inherit rounded-[2px] px-px">
            {part}
          </mark>
        );
      } else if (part) {
        nodes.push(part);
      }
    });
  }

  return (
    <div className="text-xs text-kumo-subtle mt-1 wrap-break-word">
      {start > 0 && "… "}
      {nodes}
      {end < text.length && " …"}
    </div>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  // Keep the box in sync when the URL changes (e.g. via the ⌘K modal).
  useEffect(() => setDraft(q), [q]);
  const [kind, setKind] = useState<EntityKind | null>(null);
  const { data } = useSearch(q ? { query: q, kind, limit: 50 } : null);
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);
  const drawer = useDrawer();

  function submit() {
    const next = draft.trim();
    setParams(next ? { q: next } : {});
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="relative">
          <MagnifyingGlassIcon
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-kumo-subtle"
          />
          <Input
            type="search"
            aria-label="Search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Search tasks, notes, comments…"
            autoFocus
            className="w-full pl-9"
          />
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <FilterChip label="All" active={kind === null} onClick={() => setKind(null)} />
          {ENTITY_KINDS.map((k) => (
            <FilterChip
              key={k}
              label={k}
              active={kind === k}
              onClick={() => setKind(kind === k ? null : k)}
            />
          ))}
          {q && (
            <span className="ml-auto text-xxs text-kumo-subtle tabular-nums">
              {data?.hits.length ?? 0} results
            </span>
          )}
        </div>

        {!q ? (
          <div className="mt-16 text-center text-kumo-subtle">
            <MagnifyingGlassIcon size={24} className="mx-auto mb-3 text-kumo-placeholder" />
            <div className="text-sm">Search your workspace</div>
            <div className="text-xs text-kumo-placeholder mt-1">
              Tasks, notes, comments and feedback — by keyword or meaning.
            </div>
          </div>
        ) : data && data.hits.length === 0 ? (
          <div className="mt-16 text-center text-kumo-subtle">
            <div className="text-sm">No results for “{q}”</div>
            <div className="text-xs text-kumo-placeholder mt-1">
              Try fewer or different keywords{kind ? ", or clear the kind filter" : ""}.
            </div>
          </div>
        ) : (
          <div className="mt-3 bg-kumo-base border border-kumo-line rounded-lg overflow-hidden divide-y divide-kumo-hairline">
            {data?.hits.map((h) => {
              const project = h.entity.projectId ? projectMap.get(h.entity.projectId) : undefined;
              const idLabel =
                project && h.entity.sequenceId != null
                  ? `${project.key}-${h.entity.sequenceId}`
                  : null;
              return (
                <button
                  key={h.entity.id}
                  type="button"
                  onClick={() => drawer.open(h.entity.id)}
                  className="w-full text-left p-3 flex items-start gap-3 hover:bg-kumo-tint transition-colors"
                >
                  <KindBadge kind={h.entity.kind} compact />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      {idLabel && (
                        <span className="font-mono text-xxs text-kumo-placeholder tabular-nums shrink-0">
                          {idLabel}
                        </span>
                      )}
                      <span
                        className={`text-sm truncate ${isUntitled(h.entity) ? "italic text-kumo-subtle" : "text-kumo-default"}`}
                      >
                        {displayTitle(h.entity)}
                      </span>
                    </div>
                    <Snippet body={h.entity.body} query={q} />
                    <div className="text-xxs text-kumo-placeholder mt-1 flex items-center gap-2">
                      {project && <span>{project.name}</span>}
                      <span>{format(new Date(h.entity.updatedAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-6 px-2.5 text-xxs rounded-full border capitalize transition-colors ${
        active
          ? "bg-kumo-brand-tint text-kumo-link border-kumo-brand/30"
          : "bg-kumo-base text-kumo-subtle border-kumo-line hover:text-kumo-default"
      }`}
    >
      {label}
    </button>
  );
}
