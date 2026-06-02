import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useModals } from "../state/modals";

export function TopBar() {
  const { open } = useModals();
  const mod = typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl";

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-line bg-surface">
      <Link to="/" className="flex items-center gap-2 text-ink hover:opacity-80">
        <div className="w-5 h-5 rounded-sm bg-accent flex items-center justify-center text-white text-xxs font-bold">
          b
        </div>
        <span className="text-sm font-semibold">botnote</span>
      </Link>

      <div className="flex items-center gap-2">
        <button
          className="btn btn-ghost gap-2 min-w-[200px] !justify-between !pr-1.5 !pl-2.5"
          onClick={() => open({ kind: "search" })}
          title="Search (⌘K)"
        >
          <div className="flex items-center gap-1.5 text-muted">
            <Search size={13} />
            <span className="text-xs">Search…</span>
          </div>
          <kbd>{mod}K</kbd>
        </button>
        <button
          className="btn btn-primary"
          onClick={() => open({ kind: "quick-create" })}
          title="Quick create (c)"
        >
          <Plus size={13} />
          <span className="text-xs">New</span>
          <kbd className="!bg-white/10 !border-white/20 !text-white">c</kbd>
        </button>
      </div>
    </header>
  );
}
