/**
 * AssetSelectionPanel
 *
 * Asset picker step of the loan overlay, opened from the Borrow / Repay
 * buttons. Borrow mode shows a table of borrowable reserves (Asset · Price ·
 * Available · Borrow APR) plus a per-row Market Info button into that asset's
 * borrowing markets data page; repay mode lists the user's borrowed assets with
 * only Asset · Price (APR/liquidity and market data don't apply to repaying).
 * Selecting a row advances the overlay to the borrow/repay form.
 *
 * Panel, not a dialog: `LoanFlowOverlay` owns the one full-screen shell every
 * step of the flow renders into.
 */

import { Avatar } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useNavigate } from "react-router";

import { NEUTRAL_ROW_BUTTON_CLASS } from "@/components/shared/buttonClasses";
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

interface AssetSelectionPanelProps {
  onSelectAsset: (assetSymbol: string) => void;
  /** Mode determines which columns render and the empty-state copy. */
  mode?: LoanTab;
  /**
   * Optional list of assets to display.
   * When provided, these assets are shown instead of the default borrowable reserves.
   */
  assets?: Asset[];
}

/** Normalized row, mode-agnostic, so the table render stays declarative. */
interface AssetRow {
  key: string;
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

/** Header spacer for the trailing, unlabelled Market Info column (borrow mode
 *  only): `NEUTRAL_ROW_BUTTON_CLASS`'s 120px minimum plus the row's 16px gap,
 *  so the stat columns line up with the rows below. */
const MARKET_INFO_COL_CLASS = "w-[136px] shrink-0";

/**
 * Card width for each picker mode, applied by the overlay that owns the shell.
 * Borrow is wider than repay's 612px to fit the trailing Market Info column
 * without squeezing the three stat columns (Figma 6058-44070 measures the
 * borrow picker at ~700px).
 */
export function getAssetPickerWidthClass(mode: LoanTab) {
  return mode === LOAN_TAB.REPAY ? "max-w-[612px]" : "max-w-[700px]";
}

export function AssetSelectionPanel({
  onSelectAsset,
  mode = LOAN_TAB.BORROW,
  assets,
}: AssetSelectionPanelProps) {
  const navigate = useNavigate();
  const { config: aaveConfig, borrowableReserves } = useAaveConfig();
  const isRepay = mode === LOAN_TAB.REPAY;

  const reserveIds = useMemo(
    () => borrowableReserves.map((r) => r.reserveId),
    [borrowableReserves],
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

  // Oracle prices are keyed by reserve id; repay rows arrive as plain assets
  // (no reserve id), so index the fetched prices by symbol to show them too.
  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const reserve of borrowableReserves) {
      const price = pricesByReserveId[reserve.reserveId.toString()];
      if (price != null) map.set(reserve.token.symbol, price);
    }
    return map;
  }, [borrowableReserves, pricesByReserveId]);

  // Leaves the overlay entirely — the markets data page is a route, not a step,
  // so this navigation drops the picker's query params rather than advancing.
  const handleMarketInfoClick = (assetSymbol: string) => {
    navigate(getMarketDataRoute(assetSymbol));
  };

  const rows: AssetRow[] = useMemo(() => {
    if (assets) {
      return assets.map((asset) => {
        const price = priceBySymbol.get(asset.symbol) ?? asset.priceUsd;
        return {
          key: asset.symbol,
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
    priceBySymbol,
  ]);

  const renderBody = () => {
    // Repay assets arrive ready; borrow rows wait on the oracle price read.
    if (!isRepay && pricesLoading) {
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
                {/* Spacer for the unlabelled Market Info column. */}
                <span className={MARKET_INFO_COL_CLASS} />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            // Wrapper, not one big button: borrow rows carry their own Market
            // Info button and a button cannot nest inside a button. The card's
            // padding and hover move here so the row still highlights as a
            // unit; the select control keeps the E2E testid and spans the rest
            // of the row via `flex-1`. Repay renders the wrapper's single child,
            // so its padding is unchanged from the pre-split single button.
            <div
              key={row.key}
              className="flex w-full items-center gap-4 rounded-xl bg-secondary-highlight p-4 transition-colors hover:bg-secondary-strokeLight dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
            >
              <button
                onClick={() => onSelectAsset(row.symbol)}
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
              {!isRepay && (
                <button
                  type="button"
                  onClick={() => handleMarketInfoClick(row.symbol)}
                  aria-label={COPY.loans.assetSelection.marketInfoAriaLabel(
                    row.symbol,
                  )}
                  className={`${NEUTRAL_ROW_BUTTON_CLASS} cursor-pointer`}
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
