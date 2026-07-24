/**
 * LiquidationGroupCardV3
 * The v3 rendering of a liquidation: the group's child events (collateral
 * liquidated / loan repaid) stacked as divider-separated rows inside ONE card,
 * rather than a card per row. This grouped treatment is reserved for
 * liquidations — every other activity renders as its own standalone card.
 * Each child reuses the standard row layout, so the columns line up with the
 * standalone rows above and below it.
 */

import { CARD_SHELL_CLASS } from "@/components/shared/layoutClasses";
import { COPY } from "@/copy";
import type { LiquidationGroupRow } from "@/types/activityLog";
import { getExplorerTxUrl } from "@/utils/explorer";
import { formatActivityTime } from "@/utils/formatting";

import { ActivityHashLink } from "./ActivityHashLink";
import { ActivityRowLayout } from "./ActivityRowV3";
import { STATUS_DOT } from "./statusDot";

interface LiquidationGroupCardV3Props {
  row: LiquidationGroupRow;
}

export function LiquidationGroupCardV3({ row }: LiquidationGroupCardV3Props) {
  // Every child of a liquidation shares the parent's outcome, so the status
  // column repeats the group's type rather than deriving one per child.
  const status = {
    dotClass: STATUS_DOT.liquidated,
    label: COPY.activity.typeLabels[row.type],
  };

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
            amount={`${child.amount.value} ${child.amount.symbol}`}
            status={status}
            typeLabel={child.label}
            hash={
              <ActivityHashLink
                hash={child.transactionHash}
                chain={child.chain}
                explorerUrl={getExplorerTxUrl(
                  child.chain,
                  child.transactionHash,
                )}
              />
            }
            time={formatActivityTime(child.date)}
          />
        </div>
      ))}
    </div>
  );
}
