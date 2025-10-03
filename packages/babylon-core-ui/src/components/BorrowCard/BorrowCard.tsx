import { Card } from "../Card";
import { IconButton } from "../Button";
import { PlusIcon } from "../Icons";
import type { PropsWithChildren } from "react";

/**
 * BorrowCard component - Container for vault borrow positions with add button
 * 
 * @example
 * ```tsx
 * <BorrowCard onNewBorrow={() => handleBorrow()}>
 *   <ActivityCard data={activityData} />
 *   <ActivityCard data={activityData} />
 * </BorrowCard>
 * ```
 */
export interface BorrowCardProps {
  onNewBorrow?: () => void;
  className?: string;
}

export function BorrowCard({
  onNewBorrow,
  className,
  children,
}: PropsWithChildren<BorrowCardProps>) {
  return (
    <Card className={className}>
      <div className="flex flex-col gap-4">
        {children}
        
        <div className="flex justify-center py-4">
          <IconButton 
            variant="outlined" 
            size="large" 
            onClick={onNewBorrow}
            aria-label="Create new borrow position"
          >
            <PlusIcon />
          </IconButton>
        </div>
      </div>
    </Card>
  );
}

