import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getColorMode, resolveColorMode, setColorMode } from "../colorMode";

describe("resolveColorMode", () => {
  it("passes explicit modes through", () => {
    expect(resolveColorMode("light", true)).toBe("light");
    expect(resolveColorMode("dark", false)).toBe("dark");
  });

  it("follows the OS preference for system", () => {
    expect(resolveColorMode("system", true)).toBe("dark");
    expect(resolveColorMode("system", false)).toBe("light");
  });
});

describe("setColorMode", () => {
  const stored = new Map<string, string>();

  // Node 25 ships a stub global localStorage that shadows jsdom's, so tests bring their own.
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key)
    });
  });

  afterEach(() => {
    setColorMode("system");
    stored.clear();
    vi.unstubAllGlobals();
  });

  it("persists the choice and applies it to the root element", () => {
    setColorMode("dark");
    expect(getColorMode()).toBe("dark");
    expect(window.localStorage.getItem("botnote.colorMode")).toBe("dark");
    expect(document.documentElement.dataset.mode).toBe("dark");

    setColorMode("light");
    expect(document.documentElement.dataset.mode).toBe("light");
  });
});
