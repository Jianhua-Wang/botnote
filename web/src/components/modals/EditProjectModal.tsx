import { useEffect, useState } from "react";
import { useProject, useUpdateProject } from "../../api/hooks";
import { PROJECT_STATUSES, type ProjectStatus } from "../../api/types";
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON } from "../../lib/projectTheme";
import { PROJECT_STATUS_HELP, PROJECT_STATUS_LABEL } from "../../lib/projectStatus";
import { useModals } from "../../state/modals";
import { IconColorPicker } from "../IconColorPicker";
import { ModalShell } from "../ModalShell";

export function EditProjectModal({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const update = useUpdateProject();
  const { close } = useModals();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [color, setColor] = useState(DEFAULT_PROJECT_COLOR);
  const [icon, setIcon] = useState(DEFAULT_PROJECT_ICON);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setStatus(project.status);
      setColor(project.color);
      setIcon(project.icon);
    }
  }, [project?.id, project?.name, project?.status, project?.color, project?.icon]);

  if (!project) {
    return (
      <ModalShell title="Project settings" width="max-w-md">
        <div className="p-4 text-sm text-muted">Loading…</div>
      </ModalShell>
    );
  }

  const loadedProject = project;
  const dirty =
    name !== loadedProject.name ||
    status !== loadedProject.status ||
    color !== loadedProject.color ||
    icon !== loadedProject.icon;
  const valid = name.trim().length > 0;

  return (
    <ModalShell title={`Settings · ${loadedProject.key}`} width="max-w-md">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dirty || !valid) return;
          await update.mutateAsync({
            id: loadedProject.id,
            fields: { name: name.trim(), status, color, icon }
          });
          close();
        }}
        className="p-3 space-y-3"
      >
        <div>
          <label className="block text-xxs text-muted uppercase tracking-wider mb-1">Name</label>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <IconColorPicker
          icon={icon}
          color={color}
          onIconChange={setIcon}
          onColorChange={setColor}
        />
        <div>
          <label className="block text-xxs text-muted uppercase tracking-wider mb-1">Status</label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]} · {PROJECT_STATUS_HELP[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end items-center pt-1">
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!dirty || !valid || update.isPending}
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        {update.error && (
          <div className="text-xs text-danger">{(update.error as Error).message}</div>
        )}
      </form>
    </ModalShell>
  );
}
