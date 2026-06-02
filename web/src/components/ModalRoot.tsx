import { NewProjectModal } from "./modals/NewProjectModal";
import { QuickCreateModal } from "./modals/QuickCreateModal";
import { SearchModal } from "./modals/SearchModal";
import { useModals } from "../state/modals";

export function ModalRoot() {
  const { active } = useModals();
  if (!active) return null;
  switch (active.kind) {
    case "search":
      return <SearchModal />;
    case "quick-create":
      return <QuickCreateModal initialProjectId={active.projectId} />;
    case "new-project":
      return <NewProjectModal />;
  }
}
