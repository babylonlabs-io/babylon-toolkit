/**
 * Hook for Aave reserve detail page data
 *
 * Fetches and combines:
 * - Reserve config from Aave
 * - User position data
 * - Asset metadata for display
 */

import { useMemo } from "react";
import { formatUnits } from "viem";

import { logger } from "@/infrastructure";
import { getTokenByAddress } from "@/services/token/tokenService";

import {
  KNOWN_STABLECOIN_SYMBOLS,
  STABLECOIN_FALLBACK_PRICE_USD,
} from "../../../constants";
import { useAaveConfig } from "../../../context";
import { useAaveUserPosition } from "../../../hooks";
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
    isLoading: positionLoading,
  } = useAaveUserPosition(address);

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

  // Get liquidation threshold from vBTC reserve
  const liquidationThresholdBps = vbtcReserve?.reserve.collateralFactor ?? 0;

  // Derive token price. Returns null when the price cannot be determined,
  // in which case parent components render a fallback instead of LoanProvider.
  //
  // Current strategy: derive from debt ratio when the user holds debt in
  // exactly one reserve, otherwise use the $1 stablecoin fallback for
  // first-borrow of known stablecoins.
  //
  // The debt-ratio derivation relies on debtValueUsd being the user's total
  // debt across all of their reserves, so it only yields a correct price when
  // the user has debt in a single reserve (which must be the selected one,
  // since currentDebtAmount > 0).
  //
  // TODO: Migrate to Chainlink price feeds via
  // `services/vault/src/clients/eth-contract/chainlink/query.ts` once feeds
  // are available for borrowable reserves on our target network. That would
  // remove the single-debt-reserve assumption and the stablecoin fallback.
  const tokenPriceUsd = useMemo((): number | null => {
    if (!selectedReserve) return null;

    if (currentDebtAmount > 0 && debtValueUsd > 0) {
      const userDebtReserveCount = position?.debtPositions?.size ?? 0;
      if (userDebtReserveCount !== 1) {
        logger.error(
          new Error(
            "tokenPriceUsd debt-ratio derivation requires the user to have debt in exactly one reserve",
          ),
          {
            data: {
              context: "useAaveReserveDetail.tokenPriceUsd",
              userDebtReserveCount,
              selectedReserveSymbol: selectedReserve.token.symbol,
            },
          },
        );
        return null;
      }
      return debtValueUsd / currentDebtAmount;
    }

    // First-time borrow: no debt to derive price from.
    // Only safe for stablecoins — log and return null for unknown tokens.
    const symbol = selectedReserve.token.symbol.toUpperCase();
    const isKnownStablecoin = (
      KNOWN_STABLECOIN_SYMBOLS as readonly string[]
    ).includes(symbol);

    if (!isKnownStablecoin) {
      logger.error(
        new Error(
          `Cannot derive token price for ${symbol}: no existing debt and token is not a known stablecoin`,
        ),
        {
          data: {
            context: "useAaveReserveDetail.tokenPriceUsd",
            symbol,
          },
        },
      );
      return null;
    }

    return STABLECOIN_FALLBACK_PRICE_USD;
  }, [currentDebtAmount, debtValueUsd, selectedReserve, position]);

  return {
    isLoading: configLoading || positionLoading,
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
  };
}
