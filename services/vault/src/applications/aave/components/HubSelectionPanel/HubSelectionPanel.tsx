/**
 * HubSelectionPanel
 *
 * Select hub, the borrow step after Select asset when a token is listed on
 * more than one hub. Each row is a separate market for the same token, so this
 * is where they are compared: hub, Borrow APR, what is available to borrow in
 * USD (the hub's liquidity, capped by our borrow limit on it), and a link to
 * that market's page. Selecting a row opens that reserve's form.
 *
 * Each hub is its own reserve, so the spoke's borrow-reserve cap applies per
 * row: at the cap only the market the position already owes stays pickable.
 */

import { Avatar } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import type { Address } from "viem";

import {
  NEUTRAL_ROW_BUTTON_CLASS,
  ROW_BUTTON_MIN_WIDTH_PX,
} from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import { getMarketDataRoute } from "@/routes";
import { getHubIdentity } from "@/services/aave/hubRegistry";
import { formatAprPercent } from "@/utils/formatting";

import { useAaveConfig } from "../../context";
import {
  useAaveBorrowAprs,
  useAaveReserveDrawHeadroom,
  useAaveReserveLiquidity,
  useAaveReservesPrices,
} from "../../hooks";
import {
  isReserveSelectable,
  type BorrowReserveGate,
} from "../../utils/borrowReserveLimit";
import { compactUsdLabel } from "../../utils/marketLabels";
import { groupReservesByUnderlying } from "../../utils/reserveGroups";
import { getReserveTokenLabel } from "../../utils/reserveTokenLabel";
import { BorrowLimitNotice } from "../BorrowLimitNotice";
import { HubLabel } from "../HubLabel";
import { LoanPickerFrame } from "../LoanPickerFrame";

interface HubSelectionPanelProps {
  /** Token chosen in Select asset; only its borrowable reserves are listed. */
  underlying: Address;
  onSelectReserve: (reserveId: bigint) => void;
  /** The position's standing against the spoke's borrow-reserve cap. */
  borrowGate: BorrowReserveGate;
}

/** Width of the leading Asset column; the stats share the remaining row. */
const ASSET_COL_CLASS = "flex w-[200px] shrink-0 items-center gap-4";

/** Gap between the select control and the Market Info button, in px. */
const MARKET_INFO_GAP_PX = 16;

/** Header spacer for the Market Info column, derived from the shared row
 *  button so a change to its min-width can't silently misalign the header. */
const MARKET_INFO_COL_STYLE = {
  width: ROW_BUTTON_MIN_WIDTH_PX + MARKET_INFO_GAP_PX,
};

export function HubSelectionPanel({
  underlying,
  onSelectReserve,
  borrowGate,
}: HubSelectionPanelProps) {
  const navigate = useNavigate();
  const { config, borrowableReserves } = useAaveConfig();

  const reserves = useMemo(
    () =>
      groupReservesByUnderlying(borrowableReserves).find(
        (group) => group.underlying === underlying,
      )?.reserves ?? [],
    [borrowableReserves, underlying],
  );
  const reserveIds = useMemo(
    () => reserves.map((reserve) => reserve.reserveId),
    [reserves],
  );

  // Rows stay selectable while these load: choosing a hub doesn't depend on
  // the figures, and each cell shows the empty placeholder until it lands.
  const { pricesByReserveId } = useAaveReservesPrices({
    spokeAddress: config?.coreSpokeAddress,
    reserveIds,
  });
  const { aprPercentByReserveId } = useAaveBorrowAprs({ reserves });
  const { liquidityByReserveId } = useAaveReserveLiquidity({ reserves });
  const { headroomByReserveId } = useAaveReserveDrawHeadroom({ reserves });

  const rows = useMemo(
    () =>
      reserves.map((reserve) => {
        const key = reserve.reserveId.toString();
        const aprPercent = aprPercentByReserveId[key];
        const liquidity = liquidityByReserveId[key]?.availableLiquidity;
        const headroom = headroomByReserveId[key] ?? null;
        return {
          key,
          reserveId: reserve.reserveId,
          selectable: isReserveSelectable(borrowGate, reserve.reserveId),
          token: getReserveTokenLabel(reserve),
          hub: getHubIdentity(reserve.reserve.hub),
          aprLabel:
            aprPercent == null
              ? COPY.common.emptyValue
              : formatAprPercent(aprPercent),
          // What can actually be borrowed here: the hub's liquidity, or less
          // when our borrow limit on the hub leaves less.
          availableLabel: compactUsdLabel(
            liquidity == null
              ? (headroom ?? undefined)
              : headroom == null
                ? liquidity
                : Math.min(liquidity, headroom),
            pricesByReserveId[key],
          ),
        };
      }),
    [
      reserves,
      borrowGate,
      aprPercentByReserveId,
      liquidityByReserveId,
      headroomByReserveId,
      pricesByReserveId,
    ],
  );

  return (
    <LoanPickerFrame
      title={COPY.loans.hub.selectTitle}
      notice={
        borrowGate.limit !== null && (
          <BorrowLimitNotice mode="hub" limit={borrowGate.limit} />
        )
      }
    >
      {rows.length === 0 ? (
        <p className="py-4 text-center text-accent-secondary">
          {COPY.loans.hub.empty}
        </p>
      ) : (
        <>
          <div className="flex items-center px-4 text-sm text-accent-secondary">
            <span className={`${ASSET_COL_CLASS} py-4`}>
              {COPY.loans.assetSelection.columnAsset}
            </span>
            <span className="flex-1 py-4">{COPY.loans.borrowRateLabel}</span>
            <span className="flex-1 py-4">
              {COPY.loans.hub.columnAvailable}
            </span>
            <span className="shrink-0" style={MARKET_INFO_COL_STYLE} />
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              // Wrapper, not one big button: a button cannot nest inside a
              // button, so the card's padding and hover move here.
              <div
                key={row.key}
                className={`flex w-full items-center gap-4 rounded-xl bg-background-secondary p-4 transition-colors ${
                  row.selectable ? "hover:brightness-125" : "opacity-40"
                }`}
              >
                <button
                  type="button"
                  disabled={!row.selectable}
                  onClick={() => onSelectReserve(row.reserveId)}
                  className="flex min-w-0 flex-1 items-center text-left enabled:cursor-pointer"
                  // E2E: e2e/real/actions/borrow.ts (selectHub) clicks the row
                  // by reserve id. Every row shares the token symbol, so the
                  // id is the only thing that tells them apart.
                  data-testid={`hub-option-${row.key}`}
                >
                  <div className={ASSET_COL_CLASS}>
                    <Avatar
                      url={row.token.icon}
                      alt={row.token.name}
                      size="large"
                      variant="circular"
                      className="h-12 w-12 shrink-0 rounded-full bg-white"
                    />
                    <div className="flex min-w-0 flex-col items-start">
                      <HubLabel
                        hub={row.hub}
                        className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary"
                      />
                      <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
                        {row.token.symbol}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-1 items-center text-base text-accent-primary">
                    <span className="flex-1">{row.aprLabel}</span>
                    <span className="flex-1">{row.availableLabel}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(getMarketDataRoute(row.reserveId))}
                  aria-label={COPY.loans.hub.marketInfoAriaLabel(
                    row.token.symbol,
                    row.hub.label,
                  )}
                  className={NEUTRAL_ROW_BUTTON_CLASS}
                  data-testid={`hub-market-info-${row.key}`}
                >
                  {COPY.loans.hub.marketInfo}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </LoanPickerFrame>
  );
}
