import { describe, expect, it } from "vitest";
import { formatRRuleUntil, parseRRule } from "../rrule";

// ---------------------------------------------------------------------------
// parseRRule tests
// ---------------------------------------------------------------------------

describe("parseRRule", () => {
  it("parses a simple daily rule", () => {
    const result = parseRRule("RRULE:FREQ=DAILY");
    expect(result.preset).toBe("daily");
    expect(result.interval).toBe(1);
    expect(result.byWeekday).toEqual([]);
    expect(result.count).toBeUndefined();
    expect(result.until).toBeUndefined();
  });

  it("parses weekly rule with interval", () => {
    const result = parseRRule("FREQ=WEEKLY;INTERVAL=2");
    expect(result.preset).toBe("weekly");
    expect(result.interval).toBe(2);
  });

  it("parses BYDAY weekdays correctly", () => {
    const result = parseRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(result.byWeekday).toEqual(["MO", "WE", "FR"]);
  });

  it("ignores invalid weekday values in BYDAY", () => {
    const result = parseRRule("FREQ=WEEKLY;BYDAY=MO,XX,FR");
    expect(result.byWeekday).toEqual(["MO", "FR"]);
  });

  it("parses COUNT correctly", () => {
    const result = parseRRule("FREQ=DAILY;COUNT=5");
    expect(result.count).toBe(5);
  });

  it("ignores COUNT=0 (not a valid positive repeat count)", () => {
    const result = parseRRule("FREQ=DAILY;COUNT=0");
    expect(result.count).toBeUndefined();
  });

  it("parses UNTIL with compact YYYYMMDD format", () => {
    const result = parseRRule("FREQ=DAILY;UNTIL=20241231");
    expect(result.until).toBe("2024-12-31");
  });

  it("parses UNTIL with full ISO timestamp", () => {
    const result = parseRRule("FREQ=DAILY;UNTIL=20241231T235959Z");
    expect(result.until).toBe("2024-12-31");
  });

  it("handles RRULE: prefix (case-insensitive)", () => {
    const result = parseRRule("rrule:FREQ=MONTHLY");
    expect(result.preset).toBe("monthly");
  });

  it("returns preset=undefined for unknown FREQ", () => {
    const result = parseRRule("FREQ=SECONDLY");
    expect(result.preset).toBeUndefined();
  });

  it("defaults interval to 1 when INTERVAL is not specified", () => {
    const result = parseRRule("FREQ=MONTHLY");
    expect(result.interval).toBe(1);
  });

  it("handles yearly preset", () => {
    const result = parseRRule("FREQ=YEARLY;INTERVAL=1");
    expect(result.preset).toBe("yearly");
    expect(result.interval).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatRRuleUntil tests
// ---------------------------------------------------------------------------

describe("formatRRuleUntil", () => {
  it("returns undefined for undefined input", () => {
    expect(formatRRuleUntil(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(formatRRuleUntil("")).toBeUndefined();
  });

  it("converts compact YYYYMMDD to dash-separated", () => {
    expect(formatRRuleUntil("20241231")).toBe("2024-12-31");
  });

  it("extracts date portion from YYYYMMDDTHHMMSSZ", () => {
    expect(formatRRuleUntil("20241231T235959Z")).toBe("2024-12-31");
  });

  it("falls back to ISO parsing for full ISO strings", () => {
    const result = formatRRuleUntil("2024-06-30T00:00:00Z");
    expect(result).toBe("2024-06-30");
  });

  it("returns undefined for unparseable input", () => {
    expect(formatRRuleUntil("not-a-date")).toBeUndefined();
  });
});
