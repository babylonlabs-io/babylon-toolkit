/**
 * Hook for Aave reserve detail page data
 *
 * Fetches and combines:
 * - Reserve config from Aave
 * - User position data (with position-specific collateral factor)
 * - Aave on-chain oracle price for the selected borrow token
 * - Asset metadata for display
 */

import { useMemo } from "react";
import { formatUnits } from "viem";

import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";

import { BPS_SCALE } from "../../../constants";
import { useAaveConfig } from "../../../context";
import {
  useAaveReservePrice,
  useAaveUserPosition,
  useVaultSplitParams,
} from "../../../hooks";
import type { VaultSplitParams } from "../../../hooks/useVaultSplitParams";
import type { AavePositionWithLiveData } from "../../../services";
import type { AaveReserveConfig } from "../../../services/fetchConfig";
import type { Asset } from "../../../types";

export interface UseAaveReserveDetailProps {
  /** Reserve symbol from URL param */
  reserveId: string | undefined;
  /** User's wallet address */
  address: string | undefined;
}

export interface UseAaveReserveDetailResult {
  /** Whether data is loading */
  isLoading: boolean;
  /** Selected reserve config (null if not found) */
  selectedReserve: AaveReserveConfig | null;
  /** Asset display config (null if reserve not found) */
  assetConfig: Asset | null;
  /** vBTC reserve config (for liquidation threshold) */
  vbtcReserve: AaveReserveConfig | null;
  /** Liquidation threshold in BPS */
  liquidationThresholdBps: number;
  /** User's proxy contract address (for debt queries) */
  proxyContract: string | undefined;
  /** Collateral value in USD */
  collateralValueUsd: number;
  /** Current debt amount for selected reserve in token units */
  currentDebtAmount: number;
  /** Total debt value in USD across all reserves */
  totalDebtValueUsd: number;
  /** Health factor (null if no debt) */
  healthFactor: number | null;
  /** Price of the selected borrow token in USD (null if unavailable) */
  tokenPriceUsd: number | null;
  /**
   * Position/debt-discovery error — hard-block the LoanCard (audit
   * #311 fail-closed). A failure here means we can't trust the debt
   * amount, so signing repay against it would risk under-/over-paying.
   */
  positionError: Error | null;
  /**
   * Ancillary errors from price or split-params fetches — soft-warn
   * only. Repay can still validate from loaded debt + wallet balance,
   * so unrelated infra failures should not remove the action path.
   */
  ancillaryError: Error | null;
  /** Whether position data may be stale (oracle-derived values possibly outdated) */
  isPositionDataStale: boolean;
  /** Refetch position data — returns fresh position (or null if unavailable) */
  refetchPosition: () => Promise<AavePositionWithLiveData | null>;
  /**
   * Force a fresh contract round-trip for vault split params
   * (`getDynamicReserveConfig` + `getTargetHealthFactor`). Use immediately
   * before signing a borrow or repay so the projected-HF math runs against
   * current on-chain values, not the React Query cache.
   */
  refetchSplitParams: () => Promise<VaultSplitParams | null>;
}

export function useAaveReserveDetail({
  reserveId,
  address,
}: UseAaveReserveDetailProps): UseAaveReserveDetailResult {
  const { config, vbtcReserve, allBorrowReserves } = useAaveConfig();

  // Find the selected reserve by symbol (from URL param). Match against the
  // full reserve set, not just borrowable ones - a user reaching this page
  // for repay may have debt in a reserve that is no longer borrowable.
  const selectedReserve = useMemo(() => {
    if (!reserveId) return null;
    return (
      allBorrowReserves.find(
        (r) => r.token.symbol.toLowerCase() === reserveId.toLowerCase(),
      ) ?? null
    );
  }, [allBorrowReserves, reserveId]);

  // Build asset config from reserve
  const assetConfig = useMemo((): Asset | null => {
    if (!selectedReserve) return null;
    const tokenMetadata = getTokenByAddress(selectedReserve.token.address);
    return {
      name: selectedReserve.token.name,
      symbol: selectedReserve.token.symbol,
      icon: getCurrencyIconWithFallback(
        tokenMetadata?.icon,
        selectedReserve.token.symbol,
      ),
    };
  }, [selectedReserve]);

  // Fetch user position from Aave (uses Aave oracle for USD values)
  const {
    position,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    isPositionDataStale,
    isLoading: positionLoading,
    error: positionError,
    refetch: refetchPosition,
  } = useAaveUserPosition(address);

  // Aave on-chain oracle — source of liquidation truth, so FE checks can't drift.
  const {
    priceUsd: aavePriceUsd,
    isLoading: pricesLoading,
    error: pricesError,
  } = useAaveReservePrice({
    spokeAddress: config?.coreSpokeAddress,
    reserveId: selectedReserve?.reserveId,
  });

  // Position-specific collateral factor from contract
  const {
    params: splitParams,
    isLoading: splitParamsLoading,
    error: splitParamsError,
    refetch: refetchSplitParamsRaw,
  } = useVaultSplitParams(address);

  // Pre-sign path — pass retry: 0 so a transient RPC blip surfaces fast
  // instead of stalling the click for ~7s through the default retry backoff.
  // All current consumers of this exposed refetch are pre-sign validators
  // (`validateBorrowPreSign`, `validateRepayPreSign`); the background query
  // inside `useVaultSplitParams` keeps `CONFIG_RETRY_COUNT` for resilience.
  const refetchSplitParams = () => refetchSplitParamsRaw({ retry: 0 });

  // Calculate debt amount for selected reserve in token units
  const currentDebtAmount = useMemo(() => {
    if (!selectedReserve || !position?.debtPositions) {
      return 0;
    }

    const debtPosition = position.debtPositions.get(selectedReserve.reserveId);
    if (!debtPosition) {
      return 0;
    }

    // Convert from bigint to number using token decimals
    return Number(
      formatUnits(debtPosition.totalDebt, selectedReserve.token.decimals),
    );
  }, [selectedReserve, position]);

  // Position-specific liquidation threshold from contract.
  // Uses the user's stored dynamicConfigKey (not the indexer's reserve config)
  // so it reflects the CF that the contract will actually use for liquidation.
  const liquidationThresholdBps = splitParams
    ? Math.round(splitParams.CF * BPS_SCALE)
    : 0;

  // Trust the Aave oracle; do not substitute. A null/error here disables
  // borrow downstream rather than masking a misconfigured reserve.
  const tokenPriceUsd = useMemo(
    (): number | null =>
      selectedReserve && aavePriceUsd != null && aavePriceUsd > 0
        ? aavePriceUsd
        : null,
    [selectedReserve, aavePriceUsd],
  );

  return {
    isLoading: positionLoading || pricesLoading || splitParamsLoading,
    selectedReserve,
    assetConfig,
    vbtcReserve,
    liquidationThresholdBps,
    proxyContract: position?.proxyContract,
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd: debtValueUsd,
    healthFactor,
    tokenPriceUsd,
    positionError: positionError ?? null,
    ancillaryError: pricesError ?? splitParamsError ?? null,
    isPositionDataStale,
    refetchPosition,
    refetchSplitParams,
  };
}
