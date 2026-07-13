import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useGlobalKeys } from "../hooks/useGlobalKeys";
import { EntityDrawer } from "./EntityDrawer";
import { ProjectsSidebar } from "./ProjectsSidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  useGlobalKeys();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="h-full w-full flex flex-col">
      <TopBar onMenuClick={() => setSidebarOpen((v) => !v)} />
      <div className="flex-1 min-h-0 flex">
        <div className="hidden md:flex shrink-0">
          <ProjectsSidebar />
        </div>
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-bg">
          <Outlet />
        </main>
      </div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex shadow-modal">
            <ProjectsSidebar />
          </div>
        </div>
      )}
      <EntityDrawer />
    </div>
  );
}
