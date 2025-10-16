interface AttributeListProps {
  attributes: Array<{
    label: string;
    value: string | React.ReactNode;
  }>;
  className?: string;
}

export function AttributeList({ attributes, className }: AttributeListProps) {
  return (
    <div className={className}>
      {attributes.map((attr, index) => (
        <div
          key={index}
          className="flex items-center justify-between border-b border-surface-secondary py-4 first:pt-0 last:border-0"
        >
          <span className="text-sm text-accent-secondary">{attr.label}</span>
          <span className="text-sm text-accent-primary font-medium">
            {attr.value}
          </span>
        </div>
      ))}
    </div>
  );
}

