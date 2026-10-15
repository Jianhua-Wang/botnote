import { inputVariants } from "@cloudflare/kumo/components/input";
import { cn } from "@cloudflare/kumo/utils";
import { useId, type ComponentProps, type ReactNode } from "react";

/**
 * A native <select> dressed in Kumo's input styling. Used where the option list
 * can be long (projects, tasks) or the OS picker is the better phone UX.
 */
export function NativeSelect({
  label,
  size = "base",
  id,
  className,
  ...props
}: Omit<ComponentProps<"select">, "size"> & { label?: ReactNode; size?: "sm" | "base" }) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const select = (
    <select {...props} id={selectId} className={cn(inputVariants({ size }), "min-w-0", className)} />
  );
  if (!label) return select;
  return (
    <div className="grid gap-2">
      <label htmlFor={selectId} className="text-base font-medium text-kumo-default">
        {label}
      </label>
      {select}
    </div>
  );
}
