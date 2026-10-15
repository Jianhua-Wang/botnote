import { createKumoToastManager, Toasty } from "@cloudflare/kumo/components/toast";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface ToastOptions {
  message: string;
  description?: string;
  /** Optional action button (e.g. Undo). Clicking it closes the toast without running onExpire. */
  action?: { label: string; onClick: () => void };
  /** Called when the toast closes any other way: timeout, close button or swipe. */
  onExpire?: () => void;
  duration?: number;
}

interface ToastsContextValue {
  show: (t: ToastOptions) => void;
}

const ToastsContext = createContext<ToastsContextValue | null>(null);

const DEFAULT_DURATION = 6_000;

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(createKumoToastManager);

  const value = useMemo<ToastsContextValue>(
    () => ({
      show: ({ message, description, action, onExpire, duration = DEFAULT_DURATION }) => {
        let actionTaken = false;
        const id: string = manager.add({
          title: message,
          description,
          timeout: duration,
          actions: action && [
            {
              children: action.label,
              size: "sm",
              variant: "secondary",
              onClick: () => {
                actionTaken = true;
                action.onClick();
                manager.close(id);
              }
            }
          ],
          // Manual close counts as "let it happen": run the expiry side
          // effect (e.g. commit a pending delete) rather than cancel it.
          onClose: () => {
            if (!actionTaken) onExpire?.();
          }
        });
      }
    }),
    [manager]
  );

  return (
    <ToastsContext.Provider value={value}>
      <Toasty toastManager={manager}>{children}</Toasty>
    </ToastsContext.Provider>
  );
}

export function useToasts(): ToastsContextValue {
  const ctx = useContext(ToastsContext);
  if (!ctx) throw new Error("useToasts must be used inside ToastsProvider");
  return ctx;
}
