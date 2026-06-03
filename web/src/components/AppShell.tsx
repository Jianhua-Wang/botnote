import { Outlet } from "react-router-dom";
import { useGlobalKeys } from "../hooks/useGlobalKeys";
import { EntityDrawer } from "./EntityDrawer";
import { ProjectsSidebar } from "./ProjectsSidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  useGlobalKeys();
  return (
    <div className="h-full w-full flex flex-col">
      <TopBar />
      <div className="flex-1 min-h-0 flex">
        <ProjectsSidebar />
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-bg">
          <Outlet />
        </main>
      </div>
      <EntityDrawer />
    </div>
  );
}
