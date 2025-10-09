import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { twMerge } from "tailwind-merge";
import { ReactNode } from "react";

export interface ProviderCardProps {
  id: string;
  name: string;
  icon?: ReactNode;
  deposits?: string;
  label?: string;
  isSelected: boolean;
  onToggle: (id: string) => void;
  className?: string;
}

export function ProviderCard({
  id,
  name,
  icon,
  deposits,
  label,
  isSelected,
  onToggle,
  className
}: ProviderCardProps) {
  return (
    <div className={twMerge(
      "flex flex-col gap-3 rounded-lg bg-secondary-highlight p-4",
      className
    )}>
      {/* Top row: Icon + Name + Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-main">
              {icon}
            </div>
          )}
          <Text variant="body1" className="text-base font-medium text-accent-primary sm:text-lg">
            {name}
          </Text>
        </div>
        <Button
          size="small"
          variant={isSelected ? "contained" : "outlined"}
          color="primary"
          onClick={() => onToggle(id)}
          className="min-w-[100px] text-sm sm:text-base"
        >
          {isSelected ? "Selected" : "Select"}
        </Button>
      </div>

      {/* Bottom row: Deposits and Label */}
      <div className="flex items-center justify-between text-sm text-accent-secondary">
        <Text variant="body2" className="text-sm">
          Deposits{deposits ? ` ${deposits}` : ''}
        </Text>
        <Text variant="body2" className="text-sm">
          Label{label ? ` ${label}` : ' -'}
        </Text>
      </div>
    </div>
  );
}

