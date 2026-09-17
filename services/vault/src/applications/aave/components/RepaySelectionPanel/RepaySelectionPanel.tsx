/**
 * RepaySelectionPanel
 *
 * Repay picker in the loan overlay, opened by the global Repay button when the
 * position holds more than one debt. The same token can be owed to two hubs,
 * so each row names its hub and amount, and selection routes by reserve id.
 */

import { Avatar } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { parseReserveId } from "@/routes";

import type { BorrowedAsset } from "../../hooks/useAaveBorrowedAssets";
import { HubLabel } from "../HubLabel";
import { LoanPickerFrame } from "../LoanPickerFrame";

interface RepaySelectionPanelProps {
  assets: BorrowedAsset[];
  /** Whether `assets` is still resolving; repay rows come from a query the
   *  panel does not own, so it can't infer this from an empty list. */
  assetsLoading: boolean;
  onSelectReserve: (reserveId: bigint) => void;
}

export function RepaySelectionPanel({
  assets,
  assetsLoading,
  onSelectReserve,
}: RepaySelectionPanelProps) {
  const renderBody = () => {
    // A cold load of the repay picker must not claim the user has no debt.
    if (assetsLoading) {
      return (
        <p className="py-4 text-center text-accent-secondary">
          {COPY.loans.assetSelection.loading}
        </p>
      );
    }

    if (assets.length === 0) {
      return (
        <p className="py-4 text-center text-accent-secondary">
          {COPY.loans.assetSelection.emptyRepay}
        </p>
      );
    }

    return (
      <>
        <div className="flex items-center justify-between px-4 py-4 text-sm text-accent-secondary">
          <span>{COPY.loans.assetSelection.columnAsset}</span>
          <span>{COPY.loans.assetSelection.columnDebt}</span>
        </div>

        <div className="flex flex-col gap-2">
          {assets.map((asset) => {
            // A god-mode demo debt carries an id that resolves to no reserve.
            const reserveId = parseReserveId(asset.reserveId);
            return (
              <button
                key={asset.reserveId}
                type="button"
                disabled={reserveId === null}
                onClick={() => {
                  if (reserveId !== null) onSelectReserve(reserveId);
                }}
                className="flex w-full cursor-pointer items-center gap-4 rounded-xl bg-secondary-highlight p-4 text-left transition-colors hover:bg-secondary-strokeLight disabled:cursor-not-allowed disabled:opacity-50 dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
                // E2E: e2e/real/actions/repay.ts (selectDebt) clicks the row
                // by reserve id: two debts can share a token symbol.
                data-testid={`repay-option-${asset.reserveId}`}
              >
                <Avatar
                  url={asset.icon}
                  alt={asset.name}
                  size="large"
                  variant="circular"
                  className="h-12 w-12 shrink-0 rounded-full bg-white"
                />
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="text-base text-accent-primary">
                    {asset.name}
                  </span>
                  <HubLabel
                    hub={asset.hub}
                    className="text-sm text-accent-secondary"
                  >
                    {COPY.loans.hub.tokenOnHub(asset.symbol, asset.hub.label)}
                  </HubLabel>
                </span>
                <span className="text-base text-accent-primary">
                  {`${asset.amount} ${asset.symbol}`}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <LoanPickerFrame title={COPY.loans.assetSelection.title}>
      {renderBody()}
    </LoanPickerFrame>
  );
}
