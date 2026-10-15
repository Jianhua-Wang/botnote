import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { useGlobalKeys } from "../hooks/useGlobalKeys";
import { usePersistedState } from "../hooks/usePersistedState";
import { EntityDrawer } from "./EntityDrawer";
import { ProjectsSidebar } from "./ProjectsSidebar";
import { TopBar } from "./TopBar";

const SIDEBAR_STYLE = { "--sidebar-width": "15rem" } as CSSProperties;

export function AppShell() {
  useGlobalKeys();
  const [sidebarOpen, setSidebarOpen] = usePersistedState("botnote.sidebar.open", true);

  // Uncontrolled on purpose: Kumo reuses a controlled `open` as the mobile
  // sheet state, which would pop the sheet open on every mobile load.
  return (
    <Sidebar.Provider
      collapsible="offcanvas"
      defaultOpen={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-full"
      style={SIDEBAR_STYLE}
    >
      <ProjectsSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-hidden bg-kumo-canvas">
          <Outlet />
        </main>
      </div>
      <EntityDrawer />
    </Sidebar.Provider>
  );
}
