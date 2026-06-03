import { Check } from "lucide-react";
import { PROJECT_COLORS, PROJECT_ICONS } from "../lib/projectTheme";
import { ProjectIcon } from "./ProjectIcon";

export function IconColorPicker({
  icon,
  color,
  onIconChange,
  onColorChange
}: {
  icon: string;
  color: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-xxs text-muted uppercase tracking-wider mb-1">Color</div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onColorChange(c.value)}
              className="relative w-6 h-6 rounded-full border border-line/80 hover:scale-110 transition-transform"
              style={{ backgroundColor: c.value }}
              title={c.name}
            >
              {color === c.value && (
                <Check size={12} className="absolute inset-0 m-auto text-white" strokeWidth={3} />
              )}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xxs text-muted uppercase tracking-wider mb-1">Icon</div>
        <div className="flex flex-wrap gap-1">
          {PROJECT_ICONS.map((i) => (
            <button
              key={i.name}
              type="button"
              onClick={() => onIconChange(i.name)}
              className={`w-7 h-7 rounded flex items-center justify-center border transition-colors ${
                icon === i.name
                  ? "border-accent bg-accentSoft"
                  : "border-line bg-surface hover:bg-sidebar"
              }`}
              title={i.name}
            >
              <ProjectIcon color={color} icon={i.name} size={14} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
