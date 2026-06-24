import { Fragment } from "react";

import type { Vault } from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";
import { formatBtcAmount } from "@/utils/formatting";

// Figma shows the suggested-order chips with two-decimal BTC amounts
// (e.g. "0.60 BTC"); formatBtcAmount still supplies the network coin suffix.
const CHIP_BTC_DECIMALS = 2;

interface SuggestedOrderChipsProps {
  vaults: Vault[];
}

/**
 * The "SUGGESTED ORDER" sub-box of the reorder notification
 * a label above a wrapped row of vault pills joined by arrows,
 * read left-to-right as the order the apply action would submit.
 */
export function SuggestedOrderChips({ vaults }: SuggestedOrderChipsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs uppercase tracking-[0.4px] text-accent-secondary">
        {COPY.liquidationWarnings.reorder.suggestedOrderLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {vaults.map((vault, index) => (
          <Fragment key={vault.id}>
            {index > 0 && (
              <span aria-hidden="true" className="text-accent-secondary">
                →
              </span>
            )}
            <span className="rounded-full bg-secondary-highlight px-3 py-1 text-sm text-accent-primary">
              {COPY.liquidationWarnings.reorder.vaultChip(
                vault.name,
                formatBtcAmount(vault.btc, CHIP_BTC_DECIMALS),
              )}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
