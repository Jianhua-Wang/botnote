import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type MenuPosition = {
  top: number;
  left: number;
};

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
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const menuEl = menuRef.current;
    if (!triggerEl || !menuEl) return;

    const viewportPadding = 8;
    const gap = 4;
    const triggerRect = triggerEl.getBoundingClientRect();
    const menuWidth = menuEl.offsetWidth;
    const menuHeight = menuEl.offsetHeight;
    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    const belowTop = triggerRect.bottom + gap;
    const aboveTop = triggerRect.top - menuHeight - gap;
    const hasRoomBelow = belowTop + menuHeight <= window.innerHeight - viewportPadding;
    const hasRoomAbove = aboveTop >= viewportPadding;
    const rawLeft = align === "end" ? triggerRect.right - menuWidth : triggerRect.left;
    const rawTop = hasRoomBelow || !hasRoomAbove ? belowTop : aboveTop;
    const maxTop = window.innerHeight - menuHeight - viewportPadding;

    setPosition({
      top: Math.min(Math.max(viewportPadding, rawTop), Math.max(viewportPadding, maxTop)),
      left: Math.min(Math.max(viewportPadding, rawLeft), Math.max(viewportPadding, maxLeft))
    });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
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

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </span>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="popover"
            style={{
              position: "fixed",
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? "visible" : "hidden"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
        )}
    </>
  );
}
