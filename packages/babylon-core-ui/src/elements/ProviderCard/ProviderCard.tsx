import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { twMerge } from "tailwind-merge";
import { ReactNode } from "react";

export interface ProviderCardProps {
  id: string;
  name: string;
  icon?: ReactNode;
  isSelected: boolean;
  onToggle: (id: string) => void;
  className?: string;
}

export function ProviderCard({
  id,
  name,
  icon,
  isSelected,
  onToggle,
  className
}: ProviderCardProps) {
  return (
    <div className={twMerge(
      "flex items-center justify-between p-4 rounded-lg bg-secondary-highlight dark:bg-primary-main",
      className
    )}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-main">
            {icon}
          </div>
        )}
        <Text variant="body1" className="text-lg font-medium text-accent-primary">
          {name}
        </Text>
      </div>
      <Button
        size="small"
        variant={isSelected ? "contained" : "outlined"}
        color="primary"
        rounded={true}
        onClick={() => onToggle(id)}
        className="min-w-[100px] text-sm"
      >
        {isSelected ? "Selected" : "Select"}
      </Button>
    </div>
  );
}

