import {
  BookIcon,
  BriefcaseIcon,
  CircleIcon,
  CodeIcon,
  CubeIcon,
  FlameIcon,
  FolderIcon,
  HashIcon,
  HeartIcon,
  HexagonIcon,
  LightbulbIcon,
  LightningIcon,
  PencilSimpleIcon,
  RocketIcon,
  SparkleIcon,
  SquareIcon,
  StackIcon,
  StarIcon,
  TargetIcon,
  TriangleIcon,
  type Icon
} from "@phosphor-icons/react";

// Names are persisted on projects (they predate the Phosphor switch), so they stay stable.
export const PROJECT_ICONS: Array<{ name: string; Icon: Icon }> = [
  { name: "circle", Icon: CircleIcon },
  { name: "square", Icon: SquareIcon },
  { name: "triangle", Icon: TriangleIcon },
  { name: "hexagon", Icon: HexagonIcon },
  { name: "folder", Icon: FolderIcon },
  { name: "briefcase", Icon: BriefcaseIcon },
  { name: "rocket", Icon: RocketIcon },
  { name: "sparkles", Icon: SparkleIcon },
  { name: "target", Icon: TargetIcon },
  { name: "layers", Icon: StackIcon },
  { name: "code", Icon: CodeIcon },
  { name: "book", Icon: BookIcon },
  { name: "flame", Icon: FlameIcon },
  { name: "zap", Icon: LightningIcon },
  { name: "star", Icon: StarIcon },
  { name: "heart", Icon: HeartIcon },
  { name: "box", Icon: CubeIcon },
  { name: "lightbulb", Icon: LightbulbIcon },
  { name: "pencil", Icon: PencilSimpleIcon },
  { name: "hash", Icon: HashIcon }
];

const ICON_BY_NAME = new Map(PROJECT_ICONS.map((i) => [i.name, i.Icon] as const));

export function getProjectIcon(name: string | null | undefined): Icon {
  if (!name) return CircleIcon;
  return ICON_BY_NAME.get(name) ?? CircleIcon;
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
