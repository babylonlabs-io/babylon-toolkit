import { Card } from "../Card";

export interface KeyValueItem {
  label: string;
  value: string | React.ReactNode;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
  title?: string;
  className?: string;
}

export function KeyValueList({
  items,
  title,
  className,
}: KeyValueListProps) {
  return (
    <Card className={className}>
      {title && (
        <h2 className="mb-4 text-[24px] font-normal text-accent-primary">{title}</h2>
      )}
      <div className="divide-y divide-surface-secondary">
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between py-3">
            <span className="text-[16px] font-normal text-accent-secondary">
              {item.label}
            </span>
            <span className="text-[16px] font-normal text-accent-primary">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

