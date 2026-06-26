import { describe, expect, it } from "vitest";
import type { Entity } from "../../api/types";
import { displayTitle, isUntitled } from "../entityTitle";

function makeEntity(
  title: string | null,
  body = ""
): Pick<Entity, "title" | "body"> {
  return { title, body };
}

// ---------------------------------------------------------------------------
// displayTitle
// ---------------------------------------------------------------------------

describe("displayTitle", () => {
  it("returns the title when it is set and non-empty", () => {
    expect(displayTitle(makeEntity("My Task", "some body"))).toBe("My Task");
  });

  it("returns first non-blank body line when title is null", () => {
    expect(displayTitle(makeEntity(null, "\nHello world\nSecond line"))).toBe("Hello world");
  });

  it("returns first non-blank body line when title is empty string", () => {
    expect(displayTitle(makeEntity("", "Content here"))).toBe("Content here");
  });

  it("returns first non-blank body line when title is only whitespace", () => {
    expect(displayTitle(makeEntity("   ", "  \nActual line\n"))).toBe("Actual line");
  });

  it("truncates body line at 60 chars and adds ellipsis", () => {
    const longLine = "A".repeat(65);
    const result = displayTitle(makeEntity(null, longLine));
    expect(result).toHaveLength(61); // 60 + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate body line that is exactly 60 chars", () => {
    const line = "B".repeat(60);
    const result = displayTitle(makeEntity(null, line));
    expect(result).toBe(line);
    expect(result).toHaveLength(60);
  });

  it("returns 'Untitled' when title and body are both empty", () => {
    expect(displayTitle(makeEntity(null, ""))).toBe("Untitled");
  });

  it("returns 'Untitled' when title is null and body is only whitespace/newlines", () => {
    expect(displayTitle(makeEntity(null, "   \n  \n"))).toBe("Untitled");
  });
});

// ---------------------------------------------------------------------------
// isUntitled
// ---------------------------------------------------------------------------

describe("isUntitled", () => {
  it("returns true for null title", () => {
    expect(isUntitled({ title: null })).toBe(true);
  });

  it("returns true for empty string title", () => {
    expect(isUntitled({ title: "" })).toBe(true);
  });

  it("returns true for whitespace-only title", () => {
    expect(isUntitled({ title: "   " })).toBe(true);
  });

  it("returns false for a non-empty title", () => {
    expect(isUntitled({ title: "Task" })).toBe(false);
  });

  it("returns false for title with leading/trailing whitespace but real content", () => {
    expect(isUntitled({ title: "  Hello  " })).toBe(false);
  });
});
