import { ArrowRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useProjects, useSearch } from "../../api/hooks";
import type { EntityKind } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { displayTitle } from "../../lib/entityTitle";
import { useModals } from "../../state/modals";
import { ModalShell } from "../ModalShell";

const KIND_LABELS: Record<EntityKind, string> = {
  task: "task",
  note: "note",
  comment: "comment",
  feedback: "feedback"
};

export function SearchModal() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const { close } = useModals();
  const { open: openDrawer } = useDrawer();
  const { data: projects } = useProjects();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useSearch(
    debounced ? { query: debounced, limit: 20 } : null
  );

  const projectKeyById = useMemo(() => {
    const m = new Map<string, string>();
    projects?.forEach((p) => m.set(p.id, p.key));
    return m;
  }, [projects]);

  return (
    <ModalShell title="Search">
      <div className="p-3 pb-1">
        <div className="flex items-center gap-2 px-2 h-9 border border-line rounded bg-surface focus-within:border-accent focus-within:ring-1 focus-within:ring-accentSoft">
          <Search size={14} className="text-muted" />
          <input
            autoFocus
            placeholder="Hybrid search (BM25 + vector + time decay)"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {isFetching && <span className="text-xxs text-muted">searching…</span>}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
        {debounced && !isFetching && (!data || data.hits.length === 0) && (
          <div className="px-4 py-6 text-center text-sm text-muted">No matches.</div>
        )}
        {data?.hits.map((h) => {
          const projectKey = h.entity.projectId ? projectKeyById.get(h.entity.projectId) : null;
          return (
            <button
              key={h.entity.id}
              onClick={() => {
                close();
                openDrawer(h.entity.id);
              }}
              className="w-full px-3 py-2 row-hover text-left flex items-start gap-3 border-t border-line/60"
            >
              <span className="chip mt-0.5">{KIND_LABELS[h.entity.kind]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{displayTitle(h.entity)}</div>
                <div className="text-xs text-muted truncate mt-0.5">
                  {h.entity.body.replace(/\n/g, " ").slice(0, 140) || "—"}
                </div>
                <div className="text-xxs text-faint mt-0.5 flex gap-2">
                  {projectKey && <span>· {projectKey}</span>}
                  <span>· score {h.score.toFixed(3)}</span>
                  {h.components.bm25 && <span>· bm25</span>}
                  {h.components.cosine && <span>· vec</span>}
                </div>
              </div>
              <ArrowRight size={13} className="text-faint mt-1" />
            </button>
          );
        })}
        {data && (
          <div className="px-3 py-2 text-xxs text-muted border-t border-line/60">
            {data.hits.length} result(s) · embedding {data.embeddingUsed ? "ON" : "OFF (BM25-only)"}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
