import { useCallback, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Tracks an element's rendered size. Returns a callback ref to attach and the
 * latest size; the first measurement lands before paint, so layouts that
 * depend on it don't flash.
 */
export function useElementSize<T extends HTMLElement>(): [(el: T | null) => void, ElementSize] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(measure);
    observer.current.observe(el);
  }, []);

  return [ref, size];
}
