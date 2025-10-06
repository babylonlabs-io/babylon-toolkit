import { Card } from "../Card";
import { IconButton } from "../Button";
import { PlusIcon } from "../Icons";
import type { PropsWithChildren } from "react";

/**
 * ActivityList component - Container for displaying a list of items with an add button
 *
 * @example
 * ```tsx
 * <ActivityList onNewItem={() => handleNewVault()}>
 *   <ActivityCard data={vaultActivityData} />
 *   <ActivityCard data={vaultActivityData} />
 * </ActivityList>
 * ```
 */
export interface ActivityListProps {
  onNewItem?: () => void;
  className?: string;
}

export function ActivityList({
  onNewItem,
  className,
  children,
}: PropsWithChildren<ActivityListProps>) {
  return (
    <Card className={className}>
      <div className="flex flex-col gap-4">
        {children}
        
        <div className="flex justify-center py-4">
          <IconButton
            variant="outlined"
            size="large"
            onClick={onNewItem}
            aria-label="Create new item"
          >
            <PlusIcon />
          </IconButton>
        </div>
      </div>
    </Card>
  );
}

