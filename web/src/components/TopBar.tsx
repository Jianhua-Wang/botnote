import { Button } from "@cloudflare/kumo/components/button";
import { useSidebar } from "@cloudflare/kumo/components/sidebar";
import {
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SignOutIcon
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useModals } from "../state/modals";
import { BrandLink } from "./BrandLink";

export function TopBar() {
  const { open } = useModals();
  const navigate = useNavigate();
  const { isMobile, open: sidebarOpen, toggleSidebar } = useSidebar();
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
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-kumo-line bg-kumo-base px-3">
      <div className="flex min-w-0 items-center gap-2">
        {isMobile ? (
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={<ListIcon size={18} />}
            aria-label="Open navigation"
            onClick={toggleSidebar}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={<SidebarSimpleIcon size={18} />}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            className="text-kumo-subtle"
            onClick={toggleSidebar}
          />
        )}
        {(isMobile || !sidebarOpen) && <BrandLink />}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          icon={<MagnifyingGlassIcon size={14} className="text-kumo-subtle" />}
          className="md:min-w-[220px]"
          onClick={() => open({ kind: "search" })}
        >
          <span className="sr-only sm:not-sr-only sm:flex-1 sm:text-left sm:text-kumo-subtle">
            Search…
          </span>
          <kbd className="hidden md:inline-flex">{mod}K</kbd>
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<PlusIcon size={14} weight="bold" />}
          onClick={() => open({ kind: "quick-create" })}
        >
          <span className="sr-only sm:not-sr-only">New</span>
          <kbd className="hidden border-white/25 bg-white/15 text-white md:inline-flex">c</kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<SignOutIcon size={16} />}
          title="Log out"
          className="text-kumo-subtle hover:text-kumo-danger"
          onClick={onLogout}
        />
      </div>
    </header>
  );
}
