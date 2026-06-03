import { useEffect, useRef, useState, type ReactNode } from "react";

export function PopoverMenu({
  trigger,
  children,
  align = "start"
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </span>
      {open && (
        <div
          className={`popover top-full mt-1 ${align === "end" ? "right-0" : "left-0"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
