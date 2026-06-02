import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useModals } from "../state/modals";

export function ModalShell({
  title,
  children,
  width = "max-w-2xl"
}: {
  title: string;
  children: ReactNode;
  width?: string;
}) {
  const { close } = useModals();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-ink/20"
      onClick={close}
    >
      <div
        className={`w-full ${width} bg-surface border border-line rounded-lg shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-9 px-3 flex items-center justify-between border-b border-line">
          <div className="text-xs font-semibold text-ink">{title}</div>
          <button
            onClick={close}
            className="text-muted hover:text-ink p-0.5 rounded hover:bg-line/60"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
