/**
 * Vault Split Utilities for Aave Liquidation Protection
 *
 * BTC vaults are indivisible UTXOs. During liquidation, the protocol seizes
 * whole vaults as a prefix of the borrower's ordered vault list until the
 * target seizure amount is covered. Splitting deposits into 2 optimally-sized
 * vaults (sacrificial + protected) minimizes over-seizure loss.
 *
 * The sacrificial vault (index 0) is sized to cover the expected target seizure
 * plus a safety margin. The protected vault (index 1) holds the remainder and
 * survives liquidation.
 *
 * Seizure formula (from Aave v4 Section 4.2):
 * ```
 * liq_penalty = LB × CF
 * debt_to_repay = total_debt × (THF - current_HF) / (THF - liq_penalty)
 * target_seizure = debt_to_repay × LB
 * ```
 */

/**
 * Parameters for computing the optimal vault split.
 */
export interface OptimalSplitParams {
  /** Total deposit amount in satoshis */
  totalBtc: bigint;
  /** Collateral factor (e.g. 0.75 for 75%) */
  CF: number;
  /** Liquidation bonus (e.g. 1.05 for 5% bonus) */
  LB: number;
  /** Target health factor (e.g. 1.10) */
  THF: number;
  /** Expected health factor at liquidation (e.g. 0.95) */
  expectedHF: number;
  /** Safety margin multiplier for the sacrificial vault (e.g. 1.05 for 5% buffer) */
  safetyMargin: number;
}

/**
 * Result of the optimal vault split computation.
 */
export interface OptimalSplitResult {
  /** Sacrificial vault amount in satoshis (index 0, seized first) */
  sacrificialVault: bigint;
  /** Protected vault amount in satoshis (index 1, survives liquidation) */
  protectedVault: bigint;
  /** Fraction of collateral that would be seized (0–1) */
  seizedFraction: number;
  /** Raw target seizure amount in satoshis (before safety margin) */
  targetSeizureBtc: bigint;
}

/**
 * Parameters for computing the minimum deposit required for a split.
 */
export interface MinDepositForSplitParams {
  /** Minimum peg-in amount in satoshis */
  minPegin: bigint;
  /** Seized fraction (0–1), from computeOptimalSplit or computeSeizedFraction */
  seizedFraction: number;
  /** Safety margin multiplier (e.g. 1.05) */
  safetyMargin: number;
}

/**
 * Parameters for checking if a vault rebalance is needed.
 */
export interface RebalanceCheckParams {
  /** Ordered vault amounts in satoshis (index 0 is sacrificial) */
  vaultAmounts: bigint[];
  /** Collateral factor (e.g. 0.75) */
  CF: number;
  /** Liquidation bonus (e.g. 1.05) */
  LB: number;
  /** Target health factor (e.g. 1.10) */
  THF: number;
  /** Expected health factor at liquidation (e.g. 0.95) */
  expectedHF: number;
  /** Safety margin multiplier (e.g. 1.05) */
  safetyMargin: number;
}

/**
 * Result of a vault rebalance check.
 */
export interface RebalanceCheckResult {
  /** Whether the sacrificial vault needs to be increased */
  needsRebalance: boolean;
  /** How much more the sacrificial vault needs in satoshis (0n if no rebalance needed) */
  deficit: bigint;
  /** Current sacrificial vault coverage in satoshis */
  currentCoverage: bigint;
  /** Required sacrificial vault coverage in satoshis */
  targetCoverage: bigint;
}

/**
 * Compute the fraction of collateral that would be seized during liquidation.
 *
 * Formula:
 * ```
 * liq_penalty = LB × CF
 * seized_fraction = CF × (THF - expectedHF) / (THF - liq_penalty) × LB / expectedHF
 * ```
 *
 * @param CF - Collateral factor (e.g. 0.75)
 * @param LB - Liquidation bonus (e.g. 1.05)
 * @param THF - Target health factor (e.g. 1.10)
 * @param expectedHF - Expected health factor at liquidation (e.g. 0.95)
 * @returns Seized fraction clamped to [0, 1]
 */
export function computeSeizedFraction(
  CF: number,
  LB: number,
  THF: number,
  expectedHF: number,
): number {
  const liqPenalty = LB * CF;

  // If THF <= liq_penalty, full liquidation is inevitable
  if (THF <= liqPenalty) {
    return 1;
  }

  const seizedFraction =
    (CF * (THF - expectedHF)) / (THF - liqPenalty) * (LB / expectedHF);

  return Math.max(0, Math.min(1, seizedFraction));
}

/**
 * Compute the optimal split between a sacrificial vault and a protected vault.
 *
 * The sacrificial vault (index 0) is sized to cover the target seizure amount
 * plus a safety margin. The protected vault (index 1) holds the remainder.
 *
 * @param params - Split parameters including total BTC, risk params, and safety margin
 * @returns Split result with vault sizes, seized fraction, and target seizure
 *
 * @example
 * ```typescript
 * import { computeOptimalSplit } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * const result = computeOptimalSplit({
 *   totalBtc: 1_000_000_000n, // 10 BTC in sats
 *   CF: 0.75,
 *   LB: 1.05,
 *   THF: 1.10,
 *   expectedHF: 0.95,
 *   safetyMargin: 1.05,
 * });
 * // result.sacrificialVault ≈ 418_000_000n (4.18 BTC)
 * // result.protectedVault ≈ 582_000_000n (5.82 BTC)
 * ```
 */
export function computeOptimalSplit(
  params: OptimalSplitParams,
): OptimalSplitResult {
  const { totalBtc, CF, LB, THF, expectedHF, safetyMargin } = params;

  if (totalBtc <= 0n) {
    return {
      sacrificialVault: 0n,
      protectedVault: 0n,
      seizedFraction: 0,
      targetSeizureBtc: 0n,
    };
  }

  const seizedFraction = computeSeizedFraction(CF, LB, THF, expectedHF);

  const totalBtcNum = Number(totalBtc);
  const targetSeizureBtc = BigInt(Math.ceil(totalBtcNum * seizedFraction));

  const sacrificialRaw = BigInt(
    Math.ceil(totalBtcNum * seizedFraction * safetyMargin),
  );
  const sacrificialVault =
    sacrificialRaw > totalBtc ? totalBtc : sacrificialRaw;
  const protectedVault = totalBtc - sacrificialVault;

  return {
    sacrificialVault,
    protectedVault,
    seizedFraction,
    targetSeizureBtc,
  };
}

/**
 * Compute the minimum total deposit required for a 2-vault split.
 *
 * Both vaults must be at least `minPegin` satoshis. This function returns
 * the minimum total deposit where both the sacrificial and protected vaults
 * would meet the minimum peg-in requirement.
 *
 * @param params - Parameters including minimum peg-in, seized fraction, and safety margin
 * @returns Minimum total deposit in satoshis, or 0n if split is not possible
 *
 * @example
 * ```typescript
 * import { computeMinDepositForSplit } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * const minDeposit = computeMinDepositForSplit({
 *   minPegin: 50_000n, // 0.0005 BTC
 *   seizedFraction: 0.398,
 *   safetyMargin: 1.05,
 * });
 * ```
 */
export function computeMinDepositForSplit(
  params: MinDepositForSplitParams,
): bigint {
  const { minPegin, seizedFraction, safetyMargin } = params;

  const sacrificialShare = seizedFraction * safetyMargin;

  // If sacrificial vault would consume the entire deposit, split is not possible
  if (sacrificialShare >= 1) {
    return 0n;
  }

  // If seized fraction is effectively zero, split is not useful
  if (sacrificialShare <= 0) {
    return 0n;
  }

  // Minimum total so the protected vault (smaller share) >= minPegin
  const protectedShare = 1 - sacrificialShare;
  const minFromProtected = Math.ceil(Number(minPegin) / protectedShare);

  // Minimum total so the sacrificial vault >= minPegin
  const minFromSacrificial = Math.ceil(Number(minPegin) / sacrificialShare);

  return BigInt(Math.max(minFromProtected, minFromSacrificial));
}

/**
 * Check if the sacrificial vault (index 0) needs to be increased to cover
 * the current target seizure amount.
 *
 * Used on position page load to detect when parameter changes (THF, CF, LB)
 * have made the current split insufficient.
 *
 * @param params - Current vault amounts and risk parameters
 * @returns Whether rebalance is needed, with deficit details
 *
 * @example
 * ```typescript
 * import { checkRebalanceNeeded } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * const result = checkRebalanceNeeded({
 *   vaultAmounts: [300_000_000n, 700_000_000n], // 3 BTC sacrificial, 7 BTC protected
 *   CF: 0.75,
 *   LB: 1.05,
 *   THF: 1.10,
 *   expectedHF: 0.95,
 *   safetyMargin: 1.05,
 * });
 *
 * if (result.needsRebalance) {
 *   console.log(`Sacrificial vault needs ${result.deficit} more sats`);
 * }
 * ```
 */
export function checkRebalanceNeeded(
  params: RebalanceCheckParams,
): RebalanceCheckResult {
  const { vaultAmounts, CF, LB, THF, expectedHF, safetyMargin } = params;

  if (vaultAmounts.length === 0) {
    return {
      needsRebalance: false,
      deficit: 0n,
      currentCoverage: 0n,
      targetCoverage: 0n,
    };
  }

  const totalBtc = vaultAmounts.reduce((sum, v) => sum + v, 0n);
  const seizedFraction = computeSeizedFraction(CF, LB, THF, expectedHF);

  const targetCoverage = BigInt(
    Math.ceil(Number(totalBtc) * seizedFraction * safetyMargin),
  );
  const currentCoverage = vaultAmounts[0];

  const deficit =
    targetCoverage > currentCoverage ? targetCoverage - currentCoverage : 0n;

  return {
    needsRebalance: deficit > 0n,
    deficit,
    currentCoverage,
    targetCoverage,
  };
}
