import type { EntityKind } from "../api/types";

const KIND_STYLE: Record<EntityKind, { glyph: string; color: string }> = {
  task: { glyph: "☑", color: "text-blue-600 bg-blue-50 border-blue-100" },
  note: { glyph: "✎", color: "text-slate-700 bg-slate-50 border-slate-200" },
  decision: { glyph: "◆", color: "text-amber-700 bg-amber-50 border-amber-100" },
  doc: { glyph: "📄", color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
  comment: { glyph: "💬", color: "text-slate-600 bg-slate-50 border-slate-200" },
  log: { glyph: "·", color: "text-slate-500 bg-slate-50 border-slate-200" },
  memory: { glyph: "✦", color: "text-purple-700 bg-purple-50 border-purple-100" }
};

export function KindBadge({ kind, compact = false }: { kind: EntityKind; compact?: boolean }) {
  const s = KIND_STYLE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 h-5 text-xxs rounded border ${s.color}`}
      title={kind}
    >
      <span>{s.glyph}</span>
      {!compact && <span className="uppercase tracking-wider">{kind}</span>}
    </span>
  );
}
