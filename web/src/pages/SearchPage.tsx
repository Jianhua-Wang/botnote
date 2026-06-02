import { useSearchParams } from "react-router-dom";
import { useSearch } from "../api/hooks";
import { KindBadge } from "../components/KindBadge";

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const { data } = useSearch(q ? { query: q, limit: 50 } : null);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <h1 className="text-base font-semibold">Search: "{q}"</h1>
        <div className="mt-1 text-xxs text-muted">
          {data?.hits.length ?? 0} results · embedding {data?.embeddingUsed ? "ON" : "OFF"}
        </div>
        <div className="mt-4 bg-surface border border-line rounded divide-y divide-line/60">
          {data?.hits.map((h) => (
            <div key={h.entity.id} className="p-3 flex items-start gap-3 row-hover">
              <KindBadge kind={h.entity.kind} />
              <div className="flex-1">
                <div className="text-sm">{h.entity.title}</div>
                <div className="text-xs text-muted mt-1">
                  {h.entity.body.slice(0, 200).replace(/\n/g, " ")}
                </div>
                <div className="text-xxs text-faint mt-1">score {h.score.toFixed(3)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
