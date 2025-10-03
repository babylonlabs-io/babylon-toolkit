import { Card } from "../Card";
import { IconButton } from "../Button";
import { PlusIcon } from "../Icons";

/**
 * BorrowCard component for initiating new borrow positions
 * 
 * @example
 * ```tsx
 * <BorrowCard 
 *   onNewBorrow={() => handleBorrow()} 
 *   title=""
 *   description=""
 * />
 * ```
 */
export interface BorrowCardProps {
  onNewBorrow?: () => void;
  title?: string;
  description?: string;
  className?: string;
}

export function BorrowCard({
  onNewBorrow,
  title = "",
  description = "",
  className
}: BorrowCardProps) {
  return (
    <Card className={className}>
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <IconButton 
          variant="outlined" 
          size="large" 
          onClick={onNewBorrow}
          aria-label="Create new borrow"
        >
          <PlusIcon />
        </IconButton>
        <div className="text-center">
          <h3 className="text-lg font-medium text-accent-primary">{title}</h3>
          <p className="text-sm text-accent-secondary">{description}</p>
        </div>
      </div>
    </Card>
  );
}

