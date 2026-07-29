/**
 * Hook for Aave reserve detail page data
 *
 * Fetches and combines:
 * - Reserve config from Aave, resolved by on-chain reserve id
 * - The reserve's on-chain-proven token identity (label + decimals)
 * - User position data (with position-specific collateral factor)
 * - Aave on-chain oracle price for the selected borrow token
 *
 * Nothing on this screen reads the indexer's `token.symbol/name/decimals`: a
 * compromised indexer could otherwise mislabel a genuine reserve or report
 * decimals that make the displayed figures disagree with the signed amount
 * (audit F7). Label and decimals both come from `tokenIdentity`, and every
 * derived value stays null until that identity is proven.
 */

import { useMemo } from "react";
import { formatUnits } from "viem";

import { parseReserveId } from "@/routes";
import { getCurrencyIconWithFallback } from "@/services/token/tokenService";

import { BPS_SCALE } from "../../../constants";
import { useAaveConfig } from "../../../context";
import {
  useAaveReservePrice,
  useAaveUserPosition,
  useVaultSplitParams,
  useVerifiedReserveIdentity,
} from "../../../hooks";
import type { VaultSplitParams } from "../../../hooks/useVaultSplitParams";
import type {
  AavePositionWithLiveData,
  VerifiedReserveIdentity,
} from "../../../services";
import type { AaveReserveConfig } from "../../../services/fetchConfig";
import type { Asset } from "../../../types";

export interface UseAaveReserveDetailProps {
  /**
   * Raw `?reserve=` query value — the reserve's on-chain id as a decimal
   * string. Anything else (including legacy `?reserve=<symbol>` links) resolves
   * to null and hard-blocks; it is never matched against an indexer symbol.
   */
  reserveId: string | undefined;
  /** User's wallet address */
  address: string | undefined;
}

export interface UseAaveReserveDetailResult {
  /** Whether data is loading */
  isLoading: boolean;
  /** Selected reserve config (null if not found) */
  selectedReserve: AaveReserveConfig | null;
  /**
   * On-chain-proven identity for `selectedReserve` — label and decimals. Null
   * until proven; nothing derived from the reserve may render before then.
   */
  tokenIdentity: VerifiedReserveIdentity | null;
  /** Asset display config (null until the reserve's identity is proven) */
  assetConfig: Asset | null;
  /** vBTC reserve config (for liquidation threshold) */
  vbtcReserve: AaveReserveConfig | null;
  /** Liquidation threshold in BPS */
  liquidationThresholdBps: number;
  /** User's proxy contract address (for debt queries) */
  proxyContract: string | undefined;
  /** Collateral value in USD */
  collateralValueUsd: number;
  /**
   * Current debt for the selected reserve in token units, at proven decimals.
   * Null until the identity resolves — `0` here would conflate "no debt" with
   * "not computed yet", and this figure drives the repay form's Max.
   */
  currentDebtAmount: number | null;
  /** Total debt value in USD across all reserves */
  totalDebtValueUsd: number;
  /** Health factor (null if no debt) */
  healthFactor: number | null;
  /** Price of the selected borrow token in USD (null if unavailable) */
  tokenPriceUsd: number | null;
  /**
   * True while `tokenPriceUsd` still reflects the previously-selected reserve
   * (carried over on asset switch to avoid a remount). Price-derived figures
   * (max borrow, available) must be withheld from display until this clears.
   */
  isPriceStale: boolean;
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
  /**
   * Reserve-identity failure — the strongest block on this screen, above
   * `positionError`. That one means we can't trust the debt figure; this one
   * means we can't trust *which asset the page is about*, so no label, no
   * amount and no action may render beneath it (audit F7).
   */
  identityError: Error | null;
  /**
   * True when `identityError` is a proven mismatch or an unlabelable token
   * rather than an RPC fault. Selects integrity copy over retry copy.
   */
  isIdentityCompromised: boolean;
  /** Re-run identity verification. Only meaningful for a transient failure. */
  retryIdentity: () => Promise<unknown>;
  /**
   * True when `?reserve=` carries a token symbol instead of a reserve id — an
   * outdated link. Display-only: selects "outdated link" over "not found".
   */
  isLegacyReserveParam: boolean;
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

  // A `?reserve=` value that isn't a reserve id is an outdated symbol link.
  // Surfaced so the blocked state can say so instead of "not found".
  const isLegacyReserveParam =
    reserveId != null && reserveId !== "" && parseReserveId(reserveId) === null;

  // Resolve by on-chain reserve id. Match against the full reserve set, not
  // just borrowable ones - a user reaching this page for repay may have debt in
  // a reserve that is no longer borrowable.
  const selectedReserve = useMemo(() => {
    const target = parseReserveId(reserveId);
    if (target === null) return null;
    const matches = allBorrowReserves.filter((r) => r.reserveId === target);
    // Exactly one, or nothing. `.find` would silently take whichever duplicate
    // the indexer happened to order first — the steering primitive this fix
    // removes. The id is a primary key, so a second match means the reserve set
    // itself can't be trusted.
    return matches.length === 1 ? matches[0] : null;
  }, [allBorrowReserves, reserveId]);

  // Prove what this reserve actually is before any label or amount renders.
  // Pass `reserve.underlying`, not `token.address`: those are two independent
  // indexer fields, and the one we prove is the one downstream may then trust.
  const {
    identity: verifiedIdentity,
    isLoading: identityLoading,
    error: identityError,
    isIntegrityViolation,
    retry: retryIdentity,
  } = useVerifiedReserveIdentity({
    reserveId: selectedReserve?.reserveId,
    underlying: selectedReserve?.reserve.underlying,
  });

  // Bind the identity to the reserve it belongs to: an identity without a
  // resolved reserve would let a label exist for a page that resolved nothing.
  const tokenIdentity = selectedReserve ? verifiedIdentity : null;

  // Build asset config from the proven identity, never from the indexer's
  // metadata. The icon fallback keys off the trusted symbol too, so a spoofed
  // "USDC" can't pull the USDC glyph onto a different token.
  const assetConfig = useMemo((): Asset | null => {
    if (!tokenIdentity) return null;
    return {
      name: tokenIdentity.name,
      symbol: tokenIdentity.symbol,
      icon: getCurrencyIconWithFallback(
        tokenIdentity.icon,
        tokenIdentity.symbol,
      ),
    };
  }, [tokenIdentity]);

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
    isPriceStale,
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

  // Debt for the selected reserve in token units, at proven decimals. Null
  // until the identity resolves: a `0` rendered against unverified decimals is
  // exactly the wrong-number failure this screen must not produce.
  const currentDebtAmount = useMemo((): number | null => {
    if (!selectedReserve || !tokenIdentity) {
      return null;
    }

    const debtPosition = position?.debtPositions?.get(
      selectedReserve.reserveId,
    );
    if (!debtPosition) {
      return 0;
    }

    return Number(formatUnits(debtPosition.totalDebt, tokenIdentity.decimals));
  }, [selectedReserve, tokenIdentity, position]);

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
    isLoading:
      identityLoading || positionLoading || pricesLoading || splitParamsLoading,
    selectedReserve,
    tokenIdentity,
    assetConfig,
    vbtcReserve,
    liquidationThresholdBps,
    proxyContract: position?.proxyContract,
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd: debtValueUsd,
    healthFactor,
    tokenPriceUsd,
    isPriceStale,
    positionError: positionError ?? null,
    ancillaryError: pricesError ?? splitParamsError ?? null,
    identityError,
    isIdentityCompromised: isIntegrityViolation,
    retryIdentity,
    isLegacyReserveParam,
    isPositionDataStale,
    refetchPosition,
    refetchSplitParams,
  };
}
