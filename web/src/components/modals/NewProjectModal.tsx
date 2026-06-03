import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateProject } from "../../api/hooks";
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON } from "../../lib/projectTheme";
import { useModals } from "../../state/modals";
import { IconColorPicker } from "../IconColorPicker";
import { ModalShell } from "../ModalShell";

export function NewProjectModal() {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [agentsMd, setAgentsMd] = useState("");
  const [color, setColor] = useState(DEFAULT_PROJECT_COLOR);
  const [icon, setIcon] = useState(DEFAULT_PROJECT_ICON);
  const create = useCreateProject();
  const { close } = useModals();
  const navigate = useNavigate();

  const valid = /^[A-Z][A-Z0-9_]{0,19}$/.test(key) && name.trim().length > 0;

  return (
    <ModalShell title="New project" width="max-w-md">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const p = await create.mutateAsync({
            key: key.trim(),
            name: name.trim(),
            color,
            icon,
            agentsMd: agentsMd.trim()
          });
          close();
          navigate(`/p/${p.key}`);
        }}
        className="p-3 space-y-3"
      >
        <div>
          <label className="block text-xxs text-muted uppercase tracking-wider mb-1">
            Key (uppercase, e.g. BOT)
          </label>
          <input
            autoFocus
            className="input font-mono uppercase"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="BOT"
            maxLength={20}
          />
        </div>
        <div>
          <label className="block text-xxs text-muted uppercase tracking-wider mb-1">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="botnote"
          />
        </div>
        <IconColorPicker
          icon={icon}
          color={color}
          onIconChange={setIcon}
          onColorChange={setColor}
        />
        <div>
          <label className="block text-xxs text-muted uppercase tracking-wider mb-1">
            AGENTS.md (optional)
          </label>
          <textarea
            className="input !h-24 py-1.5 font-mono text-xs leading-snug resize-y"
            value={agentsMd}
            onChange={(e) => setAgentsMd(e.target.value)}
            placeholder="## Critical&#10;- ALWAYS run pnpm typecheck before commit."
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || create.isPending}>
            {create.isPending ? "Creating…" : "Create project"}
          </button>
        </div>
        {create.error && (
          <div className="text-xs text-danger">{(create.error as Error).message}</div>
        )}
      </form>
    </ModalShell>
  );
}
