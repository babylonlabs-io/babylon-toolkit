import { twMerge } from "tailwind-merge";

export interface KeyValueItem {
  label: string;
  value: string | React.ReactNode;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
  showDivider?: boolean;
  className?: string;
}

export function KeyValueList({
  items,
  showDivider = true,
  className,
}: KeyValueListProps) {
  return (
    <div className={twMerge(showDivider && "divide-y divide-surface-secondary", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center justify-between py-4">
          <span className="text-base font-normal text-accent-secondary">
            {item.label}
          </span>
          <span className="text-base font-normal text-accent-primary">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

