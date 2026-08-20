/**
 * LiquidationGroupCardV3
 * The v3 rendering of a liquidation: the group's child events (collateral
 * liquidated / debt repaid) stacked as divider-separated rows inside ONE card,
 * rather than a card per row. This grouped treatment is reserved for
 * liquidations — every other activity renders as its own standalone card.
 * Each child reuses the standard row layout, so the columns line up with the
 * standalone rows above and below it.
 */

import { CARD_SHELL_CLASS } from "@/components/shared/layoutClasses";
import type { LiquidationGroupRow } from "@/types/activityLog";
import { formatActivityTime } from "@/utils/formatting";

import { ActivityRowLayout } from "./ActivityRowV3";
import { getUsdSubLine } from "./usdSubLine";

interface LiquidationGroupCardV3Props {
  row: LiquidationGroupRow;
  /** Symbol → USD price, from `usePrices` at the container. */
  prices?: Record<string, number>;
}

export function LiquidationGroupCardV3({
  row,
  prices,
}: LiquidationGroupCardV3Props) {
  return (
    <div className={`${CARD_SHELL_CLASS} flex flex-col gap-4 p-4`}>
      {row.children.map((child, index) => (
        <div key={child.id} className="flex flex-col gap-4">
          {index > 0 && (
            <hr className="border-t border-secondary-strokeLight dark:border-secondary-strokeDark" />
          )}
          <ActivityRowLayout
            icon={child.tokenIcon}
            iconAlt={child.amount.symbol}
            typeLabel={child.label}
            amount={child.amount}
            usdValue={getUsdSubLine(child.amount, prices)}
            chain={child.chain}
            transactionHash={child.transactionHash}
            time={formatActivityTime(child.date)}
          />
        </div>
      ))}
    </div>
  );
}
