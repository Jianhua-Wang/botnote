import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ModalRoot } from "./components/ModalRoot";
import { AgentsMdPage } from "./pages/AgentsMdPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EntityDetailPage } from "./pages/EntityDetailPage";
import { ProjectPage } from "./pages/ProjectPage";
import { SearchPage } from "./pages/SearchPage";
import { TasksPage } from "./pages/TasksPage";
import { ModalsProvider } from "./state/modals";

export default function App() {
  return (
    <ModalsProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<TasksPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/p/:key" element={<ProjectPage />} />
          <Route path="/p/:key/e/:id" element={<EntityDetailPage />} />
          <Route path="/p/:key/agents-md" element={<AgentsMdPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Route>
      </Routes>
      <ModalRoot />
    </ModalsProvider>
  );
}
