import { describe, expect, it } from "vitest";
import type { UpdateEntityInput } from "../../api/types";
import { applyRecurrenceScope, SCOPED_CONTENT_FIELDS } from "../recurrenceScope";

describe("applyRecurrenceScope", () => {
  it("injects recurrenceScope when editing a recurring occurrence title", () => {
    const result = applyRecurrenceScope({ title: "New title" }, true, "this");
    expect(result).toEqual({ title: "New title", recurrenceScope: "this" });
  });

  it("injects recurrenceScope=future by default for a body change", () => {
    const result = applyRecurrenceScope({ body: "New body" }, true, "future");
    expect(result).toEqual({ body: "New body", recurrenceScope: "future" });
  });

  it("does NOT inject recurrenceScope for a non-recurring entity", () => {
    const result = applyRecurrenceScope({ title: "New title" }, false, "this");
    expect(result).toEqual({ title: "New title" });
    expect("recurrenceScope" in result).toBe(false);
  });

  it("does NOT inject recurrenceScope when only status changes", () => {
    const result = applyRecurrenceScope({ status: "done" }, true, "this");
    expect(result).toEqual({ status: "done" });
    expect("recurrenceScope" in result).toBe(false);
  });

  it("does NOT inject recurrenceScope when only dueAt changes", () => {
    const result = applyRecurrenceScope(
      { dueAt: "2026-07-01T12:00:00.000Z" },
      true,
      "this"
    );
    expect(result).not.toHaveProperty("recurrenceScope");
  });

  it("injects recurrenceScope when tags change", () => {
    const result = applyRecurrenceScope({ tags: ["a", "b"] }, true, "future");
    expect(result).toHaveProperty("recurrenceScope", "future");
  });

  it("injects recurrenceScope when priority changes", () => {
    const result = applyRecurrenceScope({ priority: "high" }, true, "this");
    expect(result).toHaveProperty("recurrenceScope", "this");
  });

  it("injects scope when a content field changes alongside a non-content field", () => {
    const result = applyRecurrenceScope(
      { title: "New", status: "done" },
      true,
      "this"
    );
    expect(result).toEqual({ title: "New", status: "done", recurrenceScope: "this" });
  });

  it("does not mutate the input diff", () => {
    const diff = { title: "New" };
    applyRecurrenceScope(diff, true, "this");
    expect(diff).toEqual({ title: "New" });
  });

  it("covers exactly the scoped content fields", () => {
    expect([...SCOPED_CONTENT_FIELDS]).toEqual(["title", "body", "tags", "priority"]);
  });

  it("resulting payload is assignable to UpdateEntityInput", () => {
    const result = applyRecurrenceScope({ title: "Updated" }, true, "this") as UpdateEntityInput;
    expect(result.recurrenceScope).toBe("this");
  });
});
