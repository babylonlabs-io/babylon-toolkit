import { twMerge } from "tailwind-merge";

import { Copy } from "../Copy";
import { CopyIcon } from "../Icons";
import { trim } from "../../utils/trim";

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

function formatValue(value: string | React.ReactNode): string | React.ReactNode {
  if (typeof value === "string" && value.length >= 42) {
    return trim(value);
  }
  return value;
}

function shouldShowCopyIcon(value: string | React.ReactNode): value is string {
  return typeof value === "string" && value.length >= 42;
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
      {items.map((item, index) => {
        const isFormatted = shouldShowCopyIcon(item.value);
        const displayValue = formatValue(item.value);

        return (
          <div key={index} className="flex items-center justify-between">
            <span className={twMerge(textSizeClass, "font-normal text-accent-secondary")}>
              {item.label}
            </span>
            <span className={twMerge(
              textSizeClass,
              "font-normal text-accent-primary",
              isFormatted && "flex items-center gap-1.5"
            )}>
              {displayValue}
              {isFormatted && typeof item.value === "string" && (
                <Copy
                  value={item.value}
                  className="shrink-0"
                  copiedText="✓"
                >
                  <CopyIcon size={14} className="text-accent-secondary" />
                </Copy>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

