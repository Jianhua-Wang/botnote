import type { Entity } from "../api/types";

export function displayTitle(e: Pick<Entity, "title" | "body">): string {
  if (e.title && e.title.trim()) return e.title;
  const firstLine = e.body.split("\n").find((l) => l.trim())?.trim() ?? "";
  if (firstLine) return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  return "Untitled";
}

export function isUntitled(e: Pick<Entity, "title">): boolean {
  return !e.title || !e.title.trim();
}
