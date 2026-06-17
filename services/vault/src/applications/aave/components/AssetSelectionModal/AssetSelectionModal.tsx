/**
 * AssetSelectionModal
 *
 * Full-screen asset picker opened from the dashboard Borrow / Repay buttons.
 * Borrow mode shows a table of borrowable reserves (Asset · Price · Available ·
 * Borrow APR); repay mode reuses the same full-screen surface but lists the
 * user's borrowed assets with only Asset · Price (APR/liquidity don't apply to
 * repaying). Selecting a row routes into the reserve detail.
 */

import { Avatar, FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { COPY } from "@/copy";
import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";
import { formatAprPercent, formatPriceUsd } from "@/utils/formatting";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import { useAaveBorrowAprs, useAaveReservesPrices } from "../../hooks";
import type { Asset } from "../../types";

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  /** Formatted borrow APR (borrow mode only); undefined hides the cell. */
  aprLabel?: string;
}

/** Width of the leading Asset column; the stats share the remaining row. */
const ASSET_COL_CLASS = "flex w-[220px] shrink-0 items-center gap-4";

export function AssetSelectionModal({
  isOpen,
  onClose,
  onSelectAsset,
  mode = LOAN_TAB.BORROW,
  assets,
}: AssetSelectionModalProps) {
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

  const handleAssetClick = (assetSymbol: string) => {
    onSelectAsset(assetSymbol);
    onClose();
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
      return {
        key: reserveKey,
        symbol: reserve.token.symbol,
        name: reserve.token.name,
        icon: getTokenByAddress(reserve.token.address)?.icon,
        priceLabel:
          priceUsd != null ? formatPriceUsd(priceUsd) : COPY.common.emptyValue,
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
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <button
              key={row.key}
              onClick={() => handleAssetClick(row.symbol)}
              className="flex w-full cursor-pointer items-center rounded-xl bg-secondary-highlight p-4 text-left transition-colors hover:bg-secondary-strokeLight dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
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
                    <span className="flex-1">{COPY.common.emptyValue}</span>
                    <span className="flex-1">{row.aprLabel}</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <FullScreenDialog
      open={isOpen}
      onClose={onClose}
      className="items-center justify-center p-6"
    >
      <div className="mx-auto w-full max-w-[612px] rounded-2xl border border-secondary-strokeLight">
        <div className="border-b border-secondary-strokeLight p-6">
          <h3 className="text-2xl text-accent-primary">
            {COPY.loans.assetSelection.title}
          </h3>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 pt-4">{renderBody()}</div>
      </div>
    </FullScreenDialog>
  );
}
