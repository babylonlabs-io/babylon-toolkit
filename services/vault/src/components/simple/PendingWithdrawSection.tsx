/**
 * PendingWithdrawSection Component
 *
 * Displays the "Pending Withdraw" dashboard section with a list of
 * pending withdrawal cards. Renders only when there are pending withdrawals.
 * Purely presentational — receives data as props from the parent.
 */

import { PendingWithdrawCard } from "./PendingWithdrawCard";

export interface PendingWithdrawVault {
  id: string;
  amountBtc: number;
}

interface PendingWithdrawSectionProps {
  pendingWithdrawVaults: PendingWithdrawVault[];
}

export function PendingWithdrawSection({
  pendingWithdrawVaults,
}: PendingWithdrawSectionProps) {
  if (pendingWithdrawVaults.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Pending Withdraw
        </h2>
        <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
      </div>

      {/* Pending withdraw cards — scrollable when list is long */}
      <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
        {pendingWithdrawVaults.map((vault) => (
          <PendingWithdrawCard key={vault.id} amountBtc={vault.amountBtc} />
        ))}
      </div>
    </div>
  );
}
