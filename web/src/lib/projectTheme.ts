import {
  Book,
  Box,
  Briefcase,
  Circle,
  Code,
  Flame,
  Folder,
  Hash,
  Heart,
  Hexagon,
  Layers,
  Lightbulb,
  Pencil,
  Rocket,
  Sparkles,
  Square,
  Star,
  Target,
  Triangle,
  Zap,
  type LucideIcon
} from "lucide-react";

export const PROJECT_ICONS: Array<{ name: string; Icon: LucideIcon }> = [
  { name: "circle", Icon: Circle },
  { name: "square", Icon: Square },
  { name: "triangle", Icon: Triangle },
  { name: "hexagon", Icon: Hexagon },
  { name: "folder", Icon: Folder },
  { name: "briefcase", Icon: Briefcase },
  { name: "rocket", Icon: Rocket },
  { name: "sparkles", Icon: Sparkles },
  { name: "target", Icon: Target },
  { name: "layers", Icon: Layers },
  { name: "code", Icon: Code },
  { name: "book", Icon: Book },
  { name: "flame", Icon: Flame },
  { name: "zap", Icon: Zap },
  { name: "star", Icon: Star },
  { name: "heart", Icon: Heart },
  { name: "box", Icon: Box },
  { name: "lightbulb", Icon: Lightbulb },
  { name: "pencil", Icon: Pencil },
  { name: "hash", Icon: Hash }
];

const ICON_BY_NAME = new Map(PROJECT_ICONS.map((i) => [i.name, i.Icon] as const));

export function getProjectIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Circle;
  return ICON_BY_NAME.get(name) ?? Circle;
}

export const PROJECT_COLORS: Array<{ name: string; value: string }> = [
  { name: "gray", value: "#6f6f76" },
  { name: "red", value: "#ef4444" },
  { name: "orange", value: "#f59e0b" },
  { name: "yellow", value: "#eab308" },
  { name: "green", value: "#10b981" },
  { name: "teal", value: "#14b8a6" },
  { name: "cyan", value: "#06b6d4" },
  { name: "blue", value: "#3b82f6" },
  { name: "indigo", value: "#5e6ad2" },
  { name: "purple", value: "#8b5cf6" },
  { name: "pink", value: "#ec4899" }
];

export const DEFAULT_PROJECT_COLOR = "#5e6ad2";
export const DEFAULT_PROJECT_ICON = "circle";

export function isFilledIcon(name: string): boolean {
  // The default circle reads visually like a "dot" when filled.
  return name === "circle" || name === "square" || name === "triangle";
}
