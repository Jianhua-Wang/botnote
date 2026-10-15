import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, type Extension } from "@uiw/react-codemirror";
import { useIsDarkMode } from "./useColorMode";

// Let the editor sit on the surrounding Kumo surface in both modes; oneDark only contributes syntax colors.
// The `&.cm-editor` prefix outranks oneDark's own selectors regardless of mount order.
const KUMO_SURFACE = EditorView.theme({
  "&.cm-editor": { backgroundColor: "transparent", color: "var(--text-color-kumo-default)" },
  "&.cm-editor .cm-gutters": {
    backgroundColor: "var(--color-kumo-tint)",
    color: "var(--text-color-kumo-placeholder)",
    borderRight: "1px solid var(--color-kumo-hairline)"
  }
});

const LIGHT: Extension[] = [KUMO_SURFACE];
const DARK: Extension[] = [oneDark, KUMO_SURFACE];

export function useEditorTheme(): Extension[] {
  return useIsDarkMode() ? DARK : LIGHT;
}
