/**
 * AssetSelectionPanel
 *
 * Asset picker step of the loan overlay, opened from the Borrow / Repay
 * buttons. Borrow mode shows a table of borrowable reserves (Asset · Price ·
 * Available · Borrow APR) plus a per-row Market Info button into that asset's
 * borrowing markets data page; repay mode lists the user's borrowed assets with
 * only Asset · Price (APR/liquidity and market data don't apply to repaying).
 * Selecting a row advances the overlay to the borrow/repay form.
 */

import { Avatar } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useNavigate } from "react-router";

import {
  NEUTRAL_ROW_BUTTON_CLASS,
  ROW_BUTTON_MIN_WIDTH_PX,
} from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import { getMarketDataRoute } from "@/routes";
import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";
import {
  formatAprPercent,
  formatCompactTokenAmount,
  formatPriceUsd,
} from "@/utils/formatting";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import {
  useAaveBorrowAprs,
  useAaveReserveLiquidity,
  useAaveReservesPrices,
} from "../../hooks";
import type { Asset } from "../../types";

/**
 * An asset the picker can route to. The reserve id is what selection emits —
 * the symbol is a label only, so a compromised indexer can't steer the click
 * to a different reserve (audit F7).
 */
export interface SelectableAsset extends Asset {
  reserveId: bigint;
}

interface AssetSelectionPanelProps {
  onSelectAsset: (reserveId: bigint) => void;
  /** Mode determines which columns render and the empty-state copy. */
  mode?: LoanTab;
  /**
   * Optional list of assets to display.
   * When provided, these assets are shown instead of the default borrowable reserves.
   */
  assets?: SelectableAsset[];
  /** Whether `assets` is still resolving; repay rows come from a query the
   *  panel does not own, so it can't infer this from an empty list. */
  assetsLoading?: boolean;
}

/** Normalized row, mode-agnostic, so the table render stays declarative. */
interface AssetRow {
  key: string;
  reserveId: bigint;
  symbol: string;
  name: string;
  icon?: string;
  /** Formatted price string, or the empty placeholder when unavailable. */
  priceLabel: string;
  /** Formatted available liquidity (borrow mode only); undefined hides the cell. */
  availableLabel?: string;
  /** Formatted borrow APR (borrow mode only); undefined hides the cell. */
  aprLabel?: string;
}

/** Width of the leading Asset column; the stats share the remaining row. */
const ASSET_COL_CLASS = "flex w-[220px] shrink-0 items-center gap-4";

/** Gap between the select control and the Market Info button, in px. */
const MARKET_INFO_GAP_PX = 16;

/** Header spacer for the Market Info column, derived from the shared row
 *  button so a change to its min-width can't silently misalign the header. */
const MARKET_INFO_COL_STYLE = {
  width: ROW_BUTTON_MIN_WIDTH_PX + MARKET_INFO_GAP_PX,
};

/** Borrow is wider than repay to fit the Market Info column without squeezing
 *  the stat columns (Figma 6058-44070 measures it at ~700px). */
export function getAssetPickerWidthClass(mode: LoanTab) {
  return mode === LOAN_TAB.REPAY ? "max-w-[612px]" : "max-w-[700px]";
}

export function AssetSelectionPanel({
  onSelectAsset,
  mode = LOAN_TAB.BORROW,
  assets,
  assetsLoading = false,
}: AssetSelectionPanelProps) {
  const navigate = useNavigate();
  const {
    config: aaveConfig,
    borrowableReserves,
    allBorrowReserves,
  } = useAaveConfig();
  const isRepay = mode === LOAN_TAB.REPAY;
  const showMarketInfo = !isRepay;

  // Debt can sit in a reserve that is no longer borrowable (frozen or paused),
  // and repay must still price it — so repay prices the full reserve set.
  const pricedReserves = isRepay ? allBorrowReserves : borrowableReserves;
  const reserveIds = useMemo(
    () => pricedReserves.map((r) => r.reserveId),
    [pricedReserves],
  );
  const { pricesByReserveId, isLoading: pricesLoading } = useAaveReservesPrices(
    {
      spokeAddress: aaveConfig?.coreSpokeAddress,
      reserveIds,
    },
  );
  // Borrow APR is borrow-only; skip the read entirely in repay mode.
  const { aprPercentByReserveId } = useAaveBorrowAprs({
    reserves: isRepay ? [] : borrowableReserves,
  });
  // Available liquidity is borrow-only too (the column is hidden in repay).
  const { liquidityByReserveId } = useAaveReserveLiquidity({
    reserves: isRepay ? [] : borrowableReserves,
  });

  const handleMarketInfoClick = (reserveId: bigint) => {
    const underlying = pricedReserves.find((r) => r.reserveId === reserveId)
      ?.reserve.underlying;
    navigate(getMarketDataRoute(reserveId, underlying));
  };

  const rows: AssetRow[] = useMemo(() => {
    if (assets) {
      return assets.map((asset) => {
        // Repay rows carry their own reserve id, so the oracle prices fetched
        // for the borrowable set index cleanly by id here too.
        const reserveKey = asset.reserveId.toString();
        const price = pricesByReserveId[reserveKey] ?? asset.priceUsd;
        return {
          key: reserveKey,
          reserveId: asset.reserveId,
          symbol: asset.symbol,
          name: asset.name,
          icon: asset.icon,
          priceLabel:
            price != null ? formatPriceUsd(price) : COPY.common.emptyValue,
        };
      });
    }

    return borrowableReserves.map((reserve) => {
      const reserveKey = reserve.reserveId.toString();
      const priceUsd = pricesByReserveId[reserveKey] ?? undefined;
      const aprPercent = aprPercentByReserveId[reserveKey];
      const liquidity = liquidityByReserveId[reserveKey];
      return {
        key: reserveKey,
        reserveId: reserve.reserveId,
        symbol: reserve.token.symbol,
        name: reserve.token.name,
        icon: getTokenByAddress(reserve.token.address)?.icon,
        priceLabel:
          priceUsd != null ? formatPriceUsd(priceUsd) : COPY.common.emptyValue,
        availableLabel:
          liquidity == null
            ? COPY.common.emptyValue
            : `${formatCompactTokenAmount(liquidity.availableLiquidity)} ${reserve.token.symbol}`,
        aprLabel:
          aprPercent == null
            ? COPY.common.emptyValue
            : formatAprPercent(aprPercent),
      };
    });
  }, [
    assets,
    borrowableReserves,
    pricesByReserveId,
    aprPercentByReserveId,
    liquidityByReserveId,
  ]);

  const renderBody = () => {
    // Borrow rows wait on the oracle price read; repay rows wait on the
    // position query that produced them, which a cold load has not resolved.
    if (isRepay ? assetsLoading : pricesLoading) {
      return (
        <p className="py-4 text-center text-accent-secondary">
          {COPY.loans.assetSelection.loading}
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <p className="py-4 text-center text-accent-secondary">
          {isRepay
            ? COPY.loans.assetSelection.emptyRepay
            : COPY.loans.assetSelection.emptyBorrow}
        </p>
      );
    }

    return (
      <>
        <div className="flex items-center px-4 text-sm text-accent-secondary">
          <span className={ASSET_COL_CLASS}>
            {COPY.loans.assetSelection.columnAsset}
          </span>
          <div className="flex flex-1 items-center">
            <span className={`flex-1 py-4 ${isRepay ? "text-right" : ""}`}>
              {COPY.loans.assetSelection.columnPrice}
            </span>
            {!isRepay && (
              <>
                <span className="flex-1 py-4">
                  {COPY.loans.assetSelection.columnAvailable}
                </span>
                <span className="flex-1 py-4">
                  {COPY.loans.assetSelection.columnBorrowApr}
                </span>
                {showMarketInfo && (
                  <span className="shrink-0" style={MARKET_INFO_COL_STYLE} />
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            // Wrapper, not one big button: a button cannot nest inside a
            // button, so the card's padding and hover move here.
            <div
              key={row.key}
              className="flex w-full items-center gap-4 rounded-xl bg-secondary-highlight p-4 transition-colors hover:bg-secondary-strokeLight dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
            >
              <button
                onClick={() => onSelectAsset(row.reserveId)}
                className="flex min-w-0 flex-1 cursor-pointer items-center text-left"
                data-testid={`asset-select-row-${row.symbol.toLowerCase()}`}
              >
                <div className={ASSET_COL_CLASS}>
                  <Avatar
                    url={getCurrencyIconWithFallback(row.icon, row.symbol)}
                    alt={row.name}
                    size="large"
                    variant="circular"
                    className="h-12 w-12 rounded-full bg-white"
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-base text-accent-primary">
                      {row.name}
                    </span>
                    <span className="text-sm text-accent-secondary">
                      {row.symbol}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 items-center text-base text-accent-primary">
                  <span className={`flex-1 ${isRepay ? "text-right" : ""}`}>
                    {row.priceLabel}
                  </span>
                  {!isRepay && (
                    <>
                      <span className="flex-1">{row.availableLabel}</span>
                      <span className="flex-1">{row.aprLabel}</span>
                    </>
                  )}
                </div>
              </button>
              {showMarketInfo && (
                <button
                  type="button"
                  onClick={() => handleMarketInfoClick(row.reserveId)}
                  aria-label={COPY.loans.assetSelection.marketInfoAriaLabel(
                    row.symbol,
                  )}
                  className={NEUTRAL_ROW_BUTTON_CLASS}
                  data-testid={`asset-market-info-${row.symbol.toLowerCase()}`}
                >
                  {COPY.loans.assetSelection.marketInfo}
                </button>
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="mx-auto w-full rounded-2xl border border-secondary-strokeLight">
      <div className="border-b border-secondary-strokeLight p-6">
        <h3 className="text-2xl text-accent-primary">
          {COPY.loans.assetSelection.title}
        </h3>
      </div>
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4">{renderBody()}</div>
    </div>
  );
}
