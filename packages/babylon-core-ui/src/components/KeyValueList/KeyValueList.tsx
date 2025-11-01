import { twMerge } from "tailwind-merge";

export interface KeyValueItem {
  label: string;
  value: string | React.ReactNode;
}

export type KeyValueListTextSize = "small" | "medium";

export interface KeyValueListProps {
  items: KeyValueItem[];
  showDivider?: boolean;
  textSize?: KeyValueListTextSize;
  className?: string;
}

export function KeyValueList({
  items,
  showDivider = true,
  textSize = "medium",
  className,
}: KeyValueListProps) {
  const textSizeClass = textSize === "medium" ? "text-[16px]" : "text-[14px]";

  return (
    <div
      className={twMerge(
        "flex flex-col gap-6",
        showDivider && "divide-y divide-surface-secondary",
        className
      )}
    >
      {items.map((item,  index) => (
        <div key={index} className="flex items-center justify-between">
          <span className={twMerge(textSizeClass, "font-normal text-accent-secondary")}>
            {item.label}
          </span>
          <span className={twMerge(textSizeClass, "font-normal text-accent-primary")}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

