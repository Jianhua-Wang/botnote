import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useDrawer() {
  const [search, setSearch] = useSearchParams();
  const openId = search.get("d");

  const open = useCallback(
    (id: string) => {
      setSearch((prev) => {
        const next = new URLSearchParams(prev);
        next.set("d", id);
        return next;
      });
    },
    [setSearch]
  );

  const close = useCallback(() => {
    setSearch((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("d");
      return next;
    });
  }, [setSearch]);

  return { openId, open, close };
}
