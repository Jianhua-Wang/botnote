import { CheckIcon } from "@phosphor-icons/react";
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
        <div className="mb-1.5 text-base font-medium text-kumo-default">Color</div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onColorChange(c.value)}
              className="relative w-6 h-6 rounded-full border border-kumo-line hover:scale-110 transition-transform focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:ring-offset-1 focus-visible:ring-offset-kumo-base"
              style={{ backgroundColor: c.value }}
              title={c.name}
              aria-label={c.name}
              aria-pressed={color === c.value}
            >
              {color === c.value && (
                <CheckIcon size={12} weight="bold" className="absolute inset-0 m-auto text-white" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-base font-medium text-kumo-default">Icon</div>
        <div className="flex flex-wrap gap-1">
          {PROJECT_ICONS.map((i) => (
            <button
              key={i.name}
              type="button"
              onClick={() => onIconChange(i.name)}
              aria-label={i.name}
              aria-pressed={icon === i.name}
              className={`w-7 h-7 rounded-md flex items-center justify-center border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-kumo-brand ${
                icon === i.name
                  ? "border-kumo-brand bg-kumo-brand-tint"
                  : "border-kumo-line bg-kumo-base hover:bg-kumo-tint"
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
