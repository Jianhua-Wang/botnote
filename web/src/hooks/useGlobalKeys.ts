import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useModals } from "../state/modals";

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  if (t.closest(".cm-editor")) return true;
  return false;
}

export function useGlobalKeys() {
  const { active, open, close } = useModals();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;

      if (cmd && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open({ kind: "search" });
        return;
      }

      if (e.key === "Escape") {
        if (active) {
          e.preventDefault();
          close();
        }
        return;
      }

      if (isEditableTarget(e)) return;
      if (e.altKey || cmd) return;

      if (e.key === "c") {
        e.preventDefault();
        open({ kind: "quick-create" });
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        open({ kind: "new-project" });
        return;
      }
      if (e.key === "g") {
        const handler = (ev: KeyboardEvent) => {
          window.removeEventListener("keydown", handler);
          if (ev.key === "d") {
            ev.preventDefault();
            navigate("/");
          }
        };
        window.addEventListener("keydown", handler, { once: true });
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, open, close, navigate]);
}
