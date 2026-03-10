/**
 * PendingCollateralSection Component
 *
 * Displays temporary sections above Collateral when there are pending
 * collateral operations (add or withdraw) awaiting on-chain confirmation.
 * Hidden entirely when no pending operations exist.
 */

import { Card, Loader } from "@babylonlabs-io/core-ui";

interface PendingCollateralSectionProps {
  isPendingAdd: boolean;
  isPendingWithdraw: boolean;
}

export function PendingCollateralSection({
  isPendingAdd,
  isPendingWithdraw,
}: PendingCollateralSectionProps) {
  if (!isPendingAdd && !isPendingWithdraw) return null;

  return (
    <div className="w-full space-y-4">
      {isPendingAdd && <PendingCard label="Pending Deposit" />}
      {isPendingWithdraw && <PendingCard label="Pending Withdrawal" />}
    </div>
  );
}

function PendingCard({ label }: { label: string }) {
  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal text-accent-primary">{label}</h2>
        <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
      </div>
      <Card variant="filled" className="w-full">
        <div className="flex items-center gap-3 py-4">
          <Loader size={20} />
          <span className="text-base text-accent-primary">
            Waiting for confirmation...
          </span>
        </div>
      </Card>
    </div>
  );
}
