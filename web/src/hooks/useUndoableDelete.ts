import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "../api/client";
import type { Entity, TasksRangeResult } from "../api/types";
import { displayTitle } from "../lib/entityTitle";
import { useToasts } from "../state/toasts";

/** Query keys whose cached data may contain the entity being deleted. */
const LIST_KEYS = [["tasks-range"], ["recent"], ["entity-list"], ["feedback"]] as const;

function stripEntity<T>(data: T, id: string): T {
  if (Array.isArray(data)) {
    return (data as Entity[]).filter((e) => e.id !== id) as T;
  }
  if (data && typeof data === "object" && "scheduled" in (data as object)) {
    const r = data as unknown as TasksRangeResult;
    return {
      ...r,
      scheduled: r.scheduled.filter((e) => e.id !== id),
      overdue: r.overdue.filter((e) => e.id !== id),
      backlog: r.backlog.filter((e) => e.id !== id)
    } as unknown as T;
  }
  return data;
}

/**
 * Delete with a grace period instead of a native confirm(): the entity is
 * removed from all cached lists immediately, a toast offers Undo, and the
 * actual DELETE only fires when the toast expires. Undo restores the caches
 * and never touches the server.
 */
export function useUndoableDelete() {
  const qc = useQueryClient();
  const { show } = useToasts();

  return useCallback(
    (entity: Entity) => {
      // Snapshot every list query that might contain the entity, then remove
      // it optimistically so the UI reflects the delete right away.
      const snapshots: Array<[readonly unknown[], unknown]> = [];
      for (const key of LIST_KEYS) {
        for (const [queryKey, data] of qc.getQueriesData({ queryKey: key })) {
          if (data === undefined) continue;
          snapshots.push([queryKey, data]);
          qc.setQueryData(queryKey, stripEntity(data, entity.id));
        }
      }

      show({
        message: `Deleted “${displayTitle(entity)}”`,
        action: {
          label: "Undo",
          onClick: () => {
            for (const [queryKey, data] of snapshots) qc.setQueryData(queryKey, data);
          }
        },
        onExpire: () => {
          api
            .deleteEntity(entity.id)
            .then(() => {
              for (const key of LIST_KEYS) qc.invalidateQueries({ queryKey: key });
            })
            .catch(() => {
              // Server refused; put the entity back so the UI stays truthful.
              for (const [queryKey, data] of snapshots) qc.setQueryData(queryKey, data);
            });
        }
      });
    },
    [qc, show]
  );
}
