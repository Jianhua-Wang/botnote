import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useModals } from "../state/modals";

export function TopBar() {
  const { open } = useModals();
  const mod = typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl";

  return (
    <header className="h-11 flex items-center justify-between px-3 border-b border-line bg-surface">
      <Link to="/" className="flex items-center gap-1.5 text-ink hover:opacity-90">
        <div className="w-[18px] h-[18px] rounded-md bg-accent flex items-center justify-center text-white text-xxs font-bold">
          b
        </div>
        <span className="text-xs font-semibold tracking-tight">botnote</span>
      </Link>

      <div className="flex items-center gap-1.5">
        <button
          className="btn !pl-2 !pr-1.5 gap-2 min-w-[220px] !justify-between text-muted"
          onClick={() => open({ kind: "search" })}
          title="Search (⌘K)"
        >
          <div className="flex items-center gap-1.5">
            <Search size={12} />
            <span className="text-xs">Search…</span>
          </div>
          <kbd>{mod}K</kbd>
        </button>
        <button
          className="btn btn-primary"
          onClick={() => open({ kind: "quick-create" })}
          title="Quick create (c)"
        >
          <Plus size={12} />
          <span className="text-xs">New</span>
          <kbd className="!bg-white/15 !border-white/25 !text-white">c</kbd>
        </button>
      </div>
    </header>
  );
}
