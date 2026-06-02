import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ModalKind =
  | { kind: "search" }
  | { kind: "quick-create"; projectId?: string }
  | { kind: "new-project" }
  | null;

interface ModalsContextValue {
  active: ModalKind;
  open: (m: NonNullable<ModalKind>) => void;
  close: () => void;
}

const ModalsContext = createContext<ModalsContextValue | null>(null);

export function ModalsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ModalKind>(null);
  const open = useCallback((m: NonNullable<ModalKind>) => setActive(m), []);
  const close = useCallback(() => setActive(null), []);
  const value = useMemo(() => ({ active, open, close }), [active, open, close]);
  return <ModalsContext.Provider value={value}>{children}</ModalsContext.Provider>;
}

export function useModals(): ModalsContextValue {
  const ctx = useContext(ModalsContext);
  if (!ctx) throw new Error("useModals must be used inside ModalsProvider");
  return ctx;
}
