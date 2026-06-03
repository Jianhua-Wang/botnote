import { useEffect, useState } from "react";
import { useProjects, useUpdateProject } from "../../api/hooks";
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON } from "../../lib/projectTheme";
import { useModals } from "../../state/modals";
import { IconColorPicker } from "../IconColorPicker";
import { ModalShell } from "../ModalShell";

export function EditProjectModal({ projectId }: { projectId: string }) {
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const update = useUpdateProject();
  const { close } = useModals();

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_PROJECT_COLOR);
  const [icon, setIcon] = useState(DEFAULT_PROJECT_ICON);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setColor(project.color);
      setIcon(project.icon);
    }
  }, [project?.id]);

  if (!project) {
    return (
      <ModalShell title="Project settings" width="max-w-md">
        <div className="p-4 text-sm text-muted">Loading…</div>
      </ModalShell>
    );
  }

  const dirty = name !== project.name || color !== project.color || icon !== project.icon;

  return (
    <ModalShell title={`Settings · ${project.key}`} width="max-w-md">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dirty) return;
          await update.mutateAsync({
            id: project.id,
            fields: { name: name.trim(), color, icon }
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
        <div className="flex justify-between items-center pt-1">
          <div className="text-xxs text-faint">
            Edit AGENTS.md from project header → AGENTS.md tab.
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!dirty || update.isPending}
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
