/**
 * Seizure Simulation Utilities
 *
 * Simulates which vaults would be seized during Aave liquidation.
 * Vaults are seized in prefix order (index 0, 1, 2, ...) until the
 * target seizure amount is covered.
 *
 * Reference: Aave v4 Section 4.2 — liquidation seizes a prefix of the
 * borrower's ordered vault list.
 */

import { assertSafePrecision, computeSeizedFraction } from "./vaultSplit.js";

/**
 * A vault with its on-chain ID and BTC amount, in liquidation-priority order.
 */
export interface OrderedVault {
  /** On-chain vault ID (bytes32 hex string) */
  id: string;
  /** Vault amount in satoshis */
  amountSats: bigint;
}

/**
 * Parameters for simulating prefix seizure.
 */
export interface PrefixSeizureParams {
  /** Vaults in their current on-chain order (index 0 is seized first) */
  orderedVaults: OrderedVault[];
  /** Target seizure amount in satoshis */
  targetSeizureSats: bigint;
}

/**
 * Result of a prefix seizure simulation.
 */
export interface PrefixSeizureResult {
  /** Vaults that would be seized (the prefix) */
  seizedVaults: OrderedVault[];
  /** Vaults that survive liquidation */
  protectedVaults: OrderedVault[];
  /** Over-seizure amount in satoshis (total seized - target) */
  overSeizureSats: bigint;
  /** Index where seizure stops (exclusive: vaults[0..cutoffIndex] are seized) */
  cutoffIndex: number;
  /** Total amount seized in satoshis */
  totalSeizedSats: bigint;
}

/**
 * Parameters for computing target seizure in satoshis.
 */
export interface TargetSeizureParams {
  /** Total collateral in satoshis */
  totalCollateralSats: bigint;
  /** Collateral factor (e.g. 0.75) */
  CF: number;
  /** Liquidation bonus (e.g. 1.05) */
  LB: number;
  /** Target health factor (e.g. 1.10) */
  THF: number;
  /** Expected health factor at liquidation (e.g. 0.95) */
  expectedHF: number;
}

/**
 * Compute the target seizure amount in satoshis.
 *
 * Uses `computeSeizedFraction` to determine what fraction of total collateral
 * would be seized, then converts to an absolute satoshi amount.
 *
 * @param params - Total collateral and risk parameters
 * @returns Target seizure amount in satoshis (rounded up)
 *
 * @example
 * ```typescript
 * const targetSats = computeTargetSeizureSats({
 *   totalCollateralSats: 1_000_000_000n, // 10 BTC
 *   CF: 0.75,
 *   LB: 1.05,
 *   THF: 1.10,
 *   expectedHF: 0.95,
 * });
 * // targetSats ≈ 398_000_000n (3.98 BTC)
 * ```
 */
export function computeTargetSeizureSats(
  params: TargetSeizureParams,
): bigint {
  const { totalCollateralSats, CF, LB, THF, expectedHF } = params;

  if (totalCollateralSats <= 0n) {
    return 0n;
  }

  assertSafePrecision(totalCollateralSats, "totalCollateralSats");

  const seizedFraction = computeSeizedFraction(CF, LB, THF, expectedHF);

  return BigInt(Math.ceil(Number(totalCollateralSats) * seizedFraction));
}

/**
 * Simulate prefix seizure for a given set of ordered vaults.
 *
 * Walks the ordered vault list, accumulating amounts until the target
 * seizure is covered. Returns which vaults are seized vs protected,
 * the over-seizure amount, and the cutoff index.
 *
 * @param params - Ordered vaults and target seizure amount
 * @returns Seizure simulation result
 * @throws Error if orderedVaults is empty
 * @throws Error if targetSeizureSats is <= 0
 *
 * @example
 * ```typescript
 * const result = simulatePrefixSeizure({
 *   orderedVaults: [
 *     { id: "0xabc...", amountSats: 200_000_000n },
 *     { id: "0xdef...", amountSats: 300_000_000n },
 *     { id: "0x123...", amountSats: 500_000_000n },
 *   ],
 *   targetSeizureSats: 400_000_000n,
 * });
 * // result.seizedVaults = first 2 vaults (200M + 300M = 500M >= 400M)
 * // result.overSeizureSats = 100_000_000n
 * // result.cutoffIndex = 2
 * ```
 */
export function simulatePrefixSeizure(
  params: PrefixSeizureParams,
): PrefixSeizureResult {
  const { orderedVaults, targetSeizureSats } = params;

  if (orderedVaults.length === 0) {
    throw new Error("orderedVaults must not be empty");
  }

  if (targetSeizureSats <= 0n) {
    throw new Error(
      "targetSeizureSats must be positive; use computeTargetSeizureSats to derive it",
    );
  }

  let accumulated = 0n;
  let cutoffIndex = orderedVaults.length; // default: all vaults seized

  for (let i = 0; i < orderedVaults.length; i++) {
    accumulated += orderedVaults[i].amountSats;

    if (accumulated >= targetSeizureSats) {
      cutoffIndex = i + 1;
      break;
    }
  }

  const seizedVaults = orderedVaults.slice(0, cutoffIndex);
  const protectedVaults = orderedVaults.slice(cutoffIndex);
  const totalSeizedSats = accumulated;
  const overSeizureSats =
    totalSeizedSats > targetSeizureSats
      ? totalSeizedSats - targetSeizureSats
      : 0n;

  return {
    seizedVaults,
    protectedVaults,
    overSeizureSats,
    cutoffIndex,
    totalSeizedSats,
  };
}
