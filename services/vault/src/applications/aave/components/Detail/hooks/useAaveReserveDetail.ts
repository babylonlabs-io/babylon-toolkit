/**
 * Hook for Aave reserve detail page data
 *
 * Fetches and combines:
 * - Reserve config from Aave
 * - User position data (with position-specific collateral factor)
 * - Chainlink oracle prices for borrow token
 * - Asset metadata for display
 */

import { Network } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";
import { formatUnits } from "viem";

import { getBTCNetwork } from "@/config";
import { usePrices } from "@/hooks/usePrices";
import { getTokenByAddress } from "@/services/token/tokenService";

import {
  BPS_SCALE,
  KNOWN_STABLECOIN_SYMBOLS,
  STABLECOIN_FALLBACK_PRICE_USD,
} from "../../../constants";
import { useAaveConfig } from "../../../context";
import { useAaveUserPosition, useVaultSplitParams } from "../../../hooks";
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
  /** Error from price or split params fetch (null if no error) */
  error: Error | null;
  /** Whether position data may be stale (oracle-derived values possibly outdated) */
  isPositionDataStale: boolean;
  /** Refetch position data — returns fresh position (or null if unavailable) */
  refetchPosition: () => Promise<AavePositionWithLiveData | null>;
}

export function useAaveReserveDetail({
  reserveId,
  address,
}: UseAaveReserveDetailProps): UseAaveReserveDetailResult {
  // Fetch reserves from Aave config
  const {
    vbtcReserve,
    borrowableReserves,
    isLoading: configLoading,
  } = useAaveConfig();

  // Find the selected reserve by symbol (from URL param)
  const selectedReserve = useMemo(() => {
    if (!reserveId) return null;
    return (
      borrowableReserves.find(
        (r) => r.token.symbol.toLowerCase() === reserveId.toLowerCase(),
      ) ?? null
    );
  }, [borrowableReserves, reserveId]);

  // Build asset config from reserve
  const assetConfig = useMemo((): Asset | null => {
    if (!selectedReserve) return null;
    const tokenMetadata = getTokenByAddress(selectedReserve.token.address);
    return {
      name: selectedReserve.token.name,
      symbol: selectedReserve.token.symbol,
      icon: tokenMetadata?.icon ?? "",
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
    refetch: refetchPosition,
  } = useAaveUserPosition(address);

  // Chainlink oracle prices (cached app-wide via React Query)
  const {
    prices: chainlinkPrices,
    metadata: priceMetadata,
    isLoading: pricesLoading,
    error: pricesError,
  } = usePrices();

  // Position-specific collateral factor from contract
  const {
    params: splitParams,
    isLoading: splitParamsLoading,
    error: splitParamsError,
  } = useVaultSplitParams(address);

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

  // Look up token price from Chainlink oracle. On testnet where stablecoin
  // feeds are unavailable, fall back to $1 for known stablecoins only.
  const tokenPriceUsd = useMemo((): number | null => {
    if (!selectedReserve) return null;

    const symbol = selectedReserve.token.symbol.toUpperCase();
    const price = chainlinkPrices[symbol];
    const metadata = priceMetadata[symbol];

    // Reject stale or failed prices — a stale feed during a depeg event
    // would produce an inflated max-borrow / HF
    // Treat stale/failed the same as missing.
    const isPriceReliable = !metadata?.isStale && !metadata?.fetchFailed;

    if (price != null && price > 0 && isPriceReliable) {
      return price;
    }

    // Testnet/signet: Chainlink doesn't publish stablecoin feeds on Sepolia.
    // $1 is correct for mock-pegged test tokens. On mainnet a missing price
    // is a real error — return null so the UI blocks the borrow flow.
    const isKnownStablecoin = (
      KNOWN_STABLECOIN_SYMBOLS as readonly string[]
    ).includes(symbol);

    if (getBTCNetwork() !== Network.MAINNET && isKnownStablecoin) {
      return STABLECOIN_FALLBACK_PRICE_USD;
    }

    return null;
  }, [selectedReserve, chainlinkPrices, priceMetadata]);

  return {
    isLoading:
      configLoading || positionLoading || pricesLoading || splitParamsLoading,
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
    error: pricesError ?? splitParamsError ?? null,
    isPositionDataStale,
    refetchPosition,
  };
}
