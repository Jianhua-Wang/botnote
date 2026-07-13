import { LogOut, Menu, Plus, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useModals } from "../state/modals";

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { open } = useModals();
  const navigate = useNavigate();
  const mod = typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl";

  async function onLogout() {
    try {
      await api.logout();
    } catch {
      // ignore; either way send the user to /login
    }
    navigate("/login", { replace: true });
  }

  return (
    <header className="h-11 flex items-center justify-between px-3 border-b border-line bg-surface">
      <div className="flex items-center gap-1">
        <button
          className="btn btn-ghost !h-7 !w-7 !p-0 md:hidden"
          onClick={onMenuClick}
          title="Menu"
          aria-label="Toggle sidebar"
        >
          <Menu size={14} />
        </button>
        <Link to="/" className="flex items-center gap-1.5 text-ink hover:opacity-90">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="w-[18px] h-[18px]" />
          <span className="text-xs font-semibold tracking-tight">botnote</span>
        </Link>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          className="btn !pl-2 !pr-1.5 gap-2 md:min-w-[220px] !justify-between text-muted"
          onClick={() => open({ kind: "search" })}
          title="Search (⌘K)"
        >
          <div className="flex items-center gap-1.5">
            <Search size={12} />
            <span className="text-xs hidden sm:inline">Search…</span>
          </div>
          <kbd className="hidden md:inline-block">{mod}K</kbd>
        </button>
        <button
          className="btn btn-primary"
          onClick={() => open({ kind: "quick-create" })}
          title="Quick create (c)"
        >
          <Plus size={12} />
          <span className="text-xs hidden sm:inline">New</span>
          <kbd className="!bg-white/15 !border-white/25 !text-white hidden md:inline-block">c</kbd>
        </button>
        <button
          className="btn !px-1.5 !py-1 text-muted hover:!text-red-500"
          onClick={onLogout}
          title="Log out"
          aria-label="Log out"
        >
          <LogOut size={12} />
        </button>
      </div>
    </header>
  );
}
