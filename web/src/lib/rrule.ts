import type { RecurrencePreset, RecurrenceWeekday } from "../api/types";

export const RECURRENCE_PRESETS: RecurrencePreset[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly"
];

export const RECURRENCE_WEEKDAYS: RecurrenceWeekday[] = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU"
];

export function formatRRuleUntil(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ymd = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

export function parseRRule(rrule: string): {
  preset?: RecurrencePreset;
  interval?: number;
  byWeekday: RecurrenceWeekday[];
  count?: number;
  until?: string;
} {
  const parts = new Map(
    rrule
      .replace(/^RRULE:/i, "")
      .split(";")
      .map((part) => part.split("="))
      .filter((part): part is [string, string] => part.length === 2)
      .map(([key, value]) => [key.toUpperCase(), value])
  );
  const freq = parts.get("FREQ")?.toLowerCase();
  const preset = RECURRENCE_PRESETS.includes(freq as RecurrencePreset)
    ? (freq as RecurrencePreset)
    : undefined;
  const intervalRaw = Number(parts.get("INTERVAL") ?? 1);
  const countRaw = Number(parts.get("COUNT"));
  const byWeekday = (parts.get("BYDAY") ?? "")
    .split(",")
    .filter((day): day is RecurrenceWeekday =>
      RECURRENCE_WEEKDAYS.includes(day as RecurrenceWeekday)
    );
  return {
    preset,
    interval: Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1,
    byWeekday,
    count: Number.isFinite(countRaw) && countRaw > 0 ? countRaw : undefined,
    until: formatRRuleUntil(parts.get("UNTIL"))
  };
}
