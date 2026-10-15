export type ColorMode = "light" | "dark" | "system";

export const COLOR_MODES: readonly ColorMode[] = ["light", "dark", "system"];

// index.html reads the same key in an inline script so the first paint is already in the right mode.
const STORAGE_KEY = "botnote.colorMode";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();
let current: ColorMode = readStoredColorMode();

function isColorMode(value: unknown): value is ColorMode {
  return COLOR_MODES.includes(value as ColorMode);
}

function readStoredColorMode(): ColorMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isColorMode(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function prefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

export function resolveColorMode(mode: ColorMode, systemDark: boolean): "light" | "dark" {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

export function applyColorMode(): void {
  document.documentElement.dataset.mode = resolveColorMode(current, prefersDark());
  listeners.forEach((listener) => listener());
}

export function isDarkModeApplied(): boolean {
  return document.documentElement.dataset.mode === "dark";
}

export function getColorMode(): ColorMode {
  return current;
}

export function setColorMode(mode: ColorMode): void {
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // quota / private mode — the choice still applies for this tab
  }
  applyColorMode();
}

export function subscribeColorMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-applies the mode when the OS theme flips while the user is on "system". */
export function watchSystemColorMode(): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (current === "system") applyColorMode();
  };
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
