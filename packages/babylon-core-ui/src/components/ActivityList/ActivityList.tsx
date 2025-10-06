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
  isEmpty?: boolean;
  isConnected?: boolean;
}

export function ActivityList({
  onNewItem,
  className,
  children,
  isEmpty = false,
  isConnected = false,
}: PropsWithChildren<ActivityListProps>) {
  // Show empty state when connected but no activities
  if (isEmpty && isConnected) {
    return (
      <Card className={className}>
        <div className="flex flex-col items-center justify-center gap-6 py-12 px-4">
          <img
            src="/mascot-smile-expression-full-body.png"
            alt="Babylon mascot"
            className="size-[200px]"
          />
          <div className="text-center">
            <h3 className="text-xl font-semibold text-accent-primary mb-2">
              Supply Collateral BTC Trustlessly
            </h3>
            <p className="text-sm text-accent-secondary max-w-md">
              Enter the amount of BTC you want to deposit and select a provider to secure it.
              Your deposit will appear here once confirmed.
            </p>
          </div>
          <IconButton
            variant="outlined"
            size="large"
            onClick={onNewItem}
            aria-label="Create new item"
          >
            <PlusIcon />
          </IconButton>
        </div>
      </Card>
    );
  }

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

