import { getProjectIcon, isFilledIcon } from "../lib/projectTheme";

interface ProjectIconProps {
  color: string;
  icon: string;
  size?: number;
  className?: string;
}

export function ProjectIcon({ color, icon, size = 12, className = "" }: ProjectIconProps) {
  const Icon = getProjectIcon(icon);
  const filled = isFilledIcon(icon);
  return (
    <Icon
      size={size}
      className={`shrink-0 ${className}`}
      color={color}
      fill={filled ? color : "none"}
      strokeWidth={filled ? 1.2 : 1.8}
    />
  );
}
