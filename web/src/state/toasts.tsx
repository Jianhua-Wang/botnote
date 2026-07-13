import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export interface Toast {
  id: number;
  message: string;
  /** Optional action button (e.g. Undo). Clicking it dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Called when the toast times out without the action being clicked. */
  onExpire?: () => void;
}

interface ToastsContextValue {
  toasts: Toast[];
  show: (t: Omit<Toast, "id"> & { duration?: number }) => void;
  dismiss: (id: number) => void;
}

const ToastsContext = createContext<ToastsContextValue | null>(null);

const DEFAULT_DURATION = 6_000;

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ duration = DEFAULT_DURATION, ...t }: Omit<Toast, "id"> & { duration?: number }) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setToasts((ts) => ts.filter((x) => x.id !== id));
          t.onExpire?.();
        }, duration)
      );
    },
    []
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);
  return (
    <ToastsContext.Provider value={value}>
      {children}
      <ToastStack />
    </ToastsContext.Provider>
  );
}

export function useToasts(): ToastsContextValue {
  const ctx = useContext(ToastsContext);
  if (!ctx) throw new Error("useToasts must be used inside ToastsProvider");
  return ctx;
}

function ToastStack() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 pl-3 pr-2 py-2 rounded-md bg-ink text-white text-xs shadow-modal"
          role="status"
        >
          <span className="max-w-[60vw] truncate">{t.message}</span>
          {t.action && (
            <button
              className="shrink-0 px-2 py-0.5 rounded font-medium text-white/90 hover:text-white hover:bg-white/10"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className="shrink-0 px-1.5 text-white/50 hover:text-white"
            onClick={() => {
              // Manual close counts as "let it happen": run the expiry side
              // effect (e.g. commit a pending delete) rather than cancel it.
              t.onExpire?.();
              dismiss(t.id);
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
