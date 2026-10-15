import { useSyncExternalStore } from "react";
import {
  getColorMode,
  isDarkModeApplied,
  setColorMode,
  subscribeColorMode,
  type ColorMode
} from "../lib/colorMode";

export function useColorMode(): [ColorMode, (mode: ColorMode) => void] {
  const mode = useSyncExternalStore(subscribeColorMode, getColorMode);
  return [mode, setColorMode];
}

/** The mode actually on screen, with "system" resolved against the OS preference. */
export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribeColorMode, isDarkModeApplied);
}
