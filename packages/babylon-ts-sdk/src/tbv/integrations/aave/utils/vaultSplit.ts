/**
 * Vault Split Utilities for Aave Liquidation Protection
 *
 * BTC vaults are indivisible UTXOs. The Babylon Spoke liquidates one whole
 * vault per call, taking the head of the borrower's ordered vault list.
 * Splitting a deposit into 2 vaults (sacrificial + protected) lets a
 * liquidation take the small head vault and leave the rest of the position.
 *
 * The sacrificial vault (index 0) is sized so that seizing it at the expected
 * liquidation health factor lifts the position back to the split target
 * health factor. The protected vault (index 1) holds the remainder.
 *
 * Seizure formula:
 * ```
 * liq_penalty = LB × CF
 * debt_to_repay = total_debt × (THF - current_HF) / (THF - liq_penalty)
 * target_seizure = debt_to_repay × LB
 * ```
 */

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/** 1.0 in WAD fixed point, the unit of on-chain health factors. */
const WAD = 10n ** 18n;

/** 100% in basis points, the unit of on-chain liquidation bonuses. */
const PERCENTAGE_FACTOR_BPS = 10_000n;

/**
 * Split target health factor: the health factor a two-vault position lands
 * on after its sacrificial vault is seized. The sacrificial vault is sized so
 * that seizing it lifts the position back to this value.
 *
 * This is a Babylon sizing parameter, not a contract parameter. The Babylon
 * Spoke sizes each liquidation by the head vault's BTC and never reads the
 * Aave `LiquidationConfig.targetHealthFactor`, so no contract can supply it.
 * At 1.08 the sacrificial vault stays smaller than the protected vault for
 * every collateral factor up to 86%, and after the first liquidation BTC can
 * fall about 7.4% more before the protected vault is at risk. The risk model
 * and the decision are recorded in babylon-toolkit#2577.
 *
 * Changing this value resizes every new split. A change needs sign-off from
 * the risk model owner and two code-owner approvals: this file is the
 * "Multi-vault split transactions" critical path in CLAUDE.md and has its own
 * entry in .github/CODEOWNERS.
 */
export const SPLIT_TARGET_HEALTH_FACTOR = 1.08;

/**
 * Health factor at which a liquidation is assumed to land, in WAD.
 *
 * Aave liquidations settle close to 1.0 (median about 0.997 on Aave V3 over
 * a year), so the split is sized for 0.99. The liquidation bonus used for
 * sizing is read from the Spoke's bonus curve at this health factor. Same
 * ownership and review rules as {@link SPLIT_TARGET_HEALTH_FACTOR}.
 */
export const EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION_WAD =
  990_000_000_000_000_000n;

/**
 * {@link EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION_WAD} as a plain number (0.99),
 * for the floating-point split formulas.
 */
export const EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION =
  Number(EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION_WAD) / Number(WAD);

/**
 * The sacrificial vault must be strictly smaller than the protected vault.
 * Otherwise, after the first liquidation, restoring partial liquidation would
 * need a new vault larger than everything left in the position.
 */
const MAX_SACRIFICIAL_SHARE = 0.5;

/**
 * Why a two-vault split is refused:
 * - `target-not-above-expected-hf`: THF ≤ expected HF, so the seizure formula
 *   has no valid target.
 * - `target-not-above-liquidation-penalty`: THF ≤ LB × CF, so one liquidation
 *   takes the whole position.
 * - `sacrificial-not-smaller`: the sacrificial vault would not be strictly
 *   smaller than the protected vault.
 */
export type SplitSizingViolation =
  | "target-not-above-expected-hf"
  | "target-not-above-liquidation-penalty"
  | "sacrificial-not-smaller";

/**
 * Inputs of the Aave v4 liquidation bonus curve, in their on-chain units.
 */
export interface LiquidationBonusCurve {
  /** `LiquidationConfig.healthFactorForMaxBonus`, WAD. Below 1e18. */
  healthFactorForMaxBonus: bigint;
  /** `LiquidationConfig.liquidationBonusFactor`, BPS. At most 10_000. */
  liquidationBonusFactor: bigint;
  /** `DynamicReserveConfig.maxLiquidationBonus`, BPS. At least 10_000. */
  maxLiquidationBonus: bigint;
}

/**
 * Effective dust threshold for HTLC outputs in satoshis.
 *
 * Standard P2TR dust is 330 sats, but HTLC scripts are larger than a standard
 * P2TR key-path spend. A conservative estimate for an HTLC script-path output
 * is ~2000 sats. This is a defense-in-depth check — in practice, minDeposit
 * from the on-chain contract is orders of magnitude larger.
 */
const HTLC_EFFECTIVE_DUST_THRESHOLD = 2000n;

function assertSafePrecision(value: bigint, name: string): void {
  if (value > MAX_SAFE_BIGINT) {
    throw new RangeError(
      `${name} (${value}) exceeds Number.MAX_SAFE_INTEGER; precision would be lost`,
    );
  }
}

/**
 * Parameters for computing the optimal vault split.
 */
export interface OptimalSplitParams {
  /** Total deposit amount in satoshis */
  totalBtc: bigint;
  /** Collateral factor (e.g. 0.78 for 78%) */
  CF: number;
  /** Liquidation bonus at the expected health factor (e.g. 1.0504) */
  LB: number;
  /** Split target health factor (e.g. {@link SPLIT_TARGET_HEALTH_FACTOR}) */
  THF: number;
  /** Expected health factor at liquidation (e.g. {@link EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION}) */
  expectedHF: number;
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
  /** Target seizure amount in satoshis */
  targetSeizureBtc: bigint;
  /**
   * Why the split is refused, or null when it is valid. When non-null both
   * vault amounts are 0n.
   */
  sizingViolation: SplitSizingViolation | null;
}

/**
 * Parameters for computing the minimum deposit required for a split.
 */
export interface MinDepositForSplitParams {
  /** Minimum peg-in amount in satoshis */
  minPegin: bigint;
  /** Seized fraction (0–1), from computeOptimalSplit or computeSeizedFraction */
  seizedFraction: number;
}

/**
 * Compute the Aave v4 liquidation bonus at a health factor.
 *
 * Integer-exact port of `LiquidationLogic.calculateLiquidationBonus`
 * (aave-v4 `src/spoke/libraries/LiquidationLogic.sol`), which the Babylon
 * liquidation path calls with the same inputs: at or below
 * `healthFactorForMaxBonus` the bonus is the maximum; above it the bonus falls
 * linearly towards a minimum of
 * `(maxLiquidationBonus − 100%) × liquidationBonusFactor + 100%` at HF 1.0.
 * Every division rounds down, as on-chain.
 *
 * @param curve - Bonus curve inputs in on-chain units
 * @param healthFactorWad - Health factor in WAD, at most 1e18
 * @returns Liquidation bonus in BPS (e.g. 10504n for 105.04%)
 * @throws {RangeError} when an input is outside the range the contract
 *   accepts (the contract would revert or was configured out of range)
 */
export function computeLiquidationBonusBps(
  curve: LiquidationBonusCurve,
  healthFactorWad: bigint,
): bigint {
  const { healthFactorForMaxBonus, liquidationBonusFactor, maxLiquidationBonus } =
    curve;

  if (healthFactorForMaxBonus < 0n || healthFactorForMaxBonus >= WAD) {
    throw new RangeError(
      `healthFactorForMaxBonus (${healthFactorForMaxBonus}) must be in [0, 1e18)`,
    );
  }
  if (
    liquidationBonusFactor < 0n ||
    liquidationBonusFactor > PERCENTAGE_FACTOR_BPS
  ) {
    throw new RangeError(
      `liquidationBonusFactor (${liquidationBonusFactor}) must be in [0, 10000] BPS`,
    );
  }
  if (maxLiquidationBonus < PERCENTAGE_FACTOR_BPS) {
    throw new RangeError(
      `maxLiquidationBonus (${maxLiquidationBonus}) must be at least 10000 BPS`,
    );
  }
  if (healthFactorWad < 0n || healthFactorWad > WAD) {
    throw new RangeError(
      `healthFactor (${healthFactorWad}) must be in [0, 1e18]; the contract reverts above 1e18`,
    );
  }

  if (healthFactorWad <= healthFactorForMaxBonus) {
    return maxLiquidationBonus;
  }

  const minLiquidationBonus =
    ((maxLiquidationBonus - PERCENTAGE_FACTOR_BPS) * liquidationBonusFactor) /
      PERCENTAGE_FACTOR_BPS +
    PERCENTAGE_FACTOR_BPS;

  return (
    minLiquidationBonus +
    ((maxLiquidationBonus - minLiquidationBonus) * (WAD - healthFactorWad)) /
      (WAD - healthFactorForMaxBonus)
  );
}

/**
 * The liquidation bonus a split is sized against: the Spoke's bonus curve at
 * {@link EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION_WAD}, as a multiplier.
 *
 * Every consumer of the split inputs (the deposit split, the liquidation
 * warnings, the reorder guard, the E2E CLI) must use this one value, or a
 * fresh split falls short of the seizure the warnings expect.
 *
 * @param bonusConfig - `healthFactorForMaxBonus` (WAD) and
 *   `liquidationBonusFactor` (BPS) from the Spoke's liquidation config
 * @param maxLiquidationBonusBps - `maxLiquidationBonus` (BPS) of the dynamic
 *   config the position's liquidation uses
 * @returns Liquidation bonus multiplier (e.g. 1.0504)
 * @throws {RangeError} when an input is outside the range the contract accepts
 */
export function computeSplitLiquidationBonus(
  bonusConfig: Omit<LiquidationBonusCurve, "maxLiquidationBonus">,
  maxLiquidationBonusBps: number,
): number {
  const bonusBps = computeLiquidationBonusBps(
    { ...bonusConfig, maxLiquidationBonus: BigInt(maxLiquidationBonusBps) },
    EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION_WAD,
  );
  return Number(bonusBps) / Number(PERCENTAGE_FACTOR_BPS);
}

/**
 * Check the split sizing parameters before a two-vault split is offered.
 *
 * @param params - Split target health factor, expected health factor at
 *   liquidation, collateral factor and liquidation bonus
 * @returns The first violated rule, or null when a split may be offered
 */
export function findSplitSizingViolation(params: {
  CF: number;
  LB: number;
  THF: number;
  expectedHF: number;
}): SplitSizingViolation | null {
  const { CF, LB, THF, expectedHF } = params;

  // Negated comparisons so a NaN input is refused rather than let through.
  if (!(THF > expectedHF)) {
    return "target-not-above-expected-hf";
  }
  if (!(THF > LB * CF)) {
    return "target-not-above-liquidation-penalty";
  }
  if (!(computeSeizedFraction(CF, LB, THF, expectedHF) < MAX_SACRIFICIAL_SHARE)) {
    return "sacrificial-not-smaller";
  }
  return null;
}

/**
 * Compute the fraction of collateral that would be seized during liquidation,
 * returning both the raw (unclamped) and clamped values.
 *
 * The raw value is useful for detecting unusual protocol parameter combinations
 * (values outside [0, 1] indicate something unexpected).
 *
 * Formula:
 * ```
 * liq_penalty = LB × CF
 * seized_fraction = CF × (THF - expectedHF) / (THF - liq_penalty) × LB / expectedHF
 * ```
 *
 * @param CF - Collateral factor (e.g. 0.78)
 * @param LB - Liquidation bonus at the expected health factor (e.g. 1.0504, see {@link computeSplitLiquidationBonus})
 * @param THF - Split target health factor (e.g. {@link SPLIT_TARGET_HEALTH_FACTOR})
 * @param expectedHF - Expected health factor at liquidation (e.g. {@link EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION})
 * @returns Both the raw seized fraction and the clamped [0, 1] value
 */
export function computeSeizedFractionDetailed(
  CF: number,
  LB: number,
  THF: number,
  expectedHF: number,
): { seizedFraction: number; seizedFractionRaw: number } {
  // HF ≤ 0 means position is fully underwater — full seizure
  if (expectedHF <= 0) {
    return { seizedFraction: 1, seizedFractionRaw: Infinity };
  }

  const liqPenalty = LB * CF;

  // If THF <= liq_penalty, full liquidation is inevitable
  if (THF <= liqPenalty) {
    return { seizedFraction: 1, seizedFractionRaw: Infinity };
  }

  // Floating-point errors here are ~1e-15, below one satoshi for any BTC
  // amount, and computeOptimalSplit rounds the sacrificial vault up.
  const seizedFractionRaw =
    ((CF * (THF - expectedHF)) / (THF - liqPenalty)) * (LB / expectedHF);

  return {
    seizedFraction: Math.max(0, Math.min(1, seizedFractionRaw)),
    seizedFractionRaw,
  };
}

/**
 * Compute the fraction of collateral that would be seized during liquidation.
 *
 * @param CF - Collateral factor (e.g. 0.78)
 * @param LB - Liquidation bonus at the expected health factor (e.g. 1.0504, see {@link computeSplitLiquidationBonus})
 * @param THF - Split target health factor (e.g. {@link SPLIT_TARGET_HEALTH_FACTOR})
 * @param expectedHF - Expected health factor at liquidation (e.g. {@link EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION})
 * @returns Seized fraction clamped to [0, 1]
 */
export function computeSeizedFraction(
  CF: number,
  LB: number,
  THF: number,
  expectedHF: number,
): number {
  return computeSeizedFractionDetailed(CF, LB, THF, expectedHF).seizedFraction;
}

/**
 * Compute the optimal split between a sacrificial vault and a protected vault.
 *
 * The sacrificial vault (index 0) is the target seizure rounded up to a whole
 * satoshi. The protected vault (index 1) holds the remainder. A split whose
 * parameters fail {@link findSplitSizingViolation}, or whose sacrificial vault
 * would not be strictly smaller than the protected one, is refused: both
 * amounts are 0n and `sizingViolation` says why.
 *
 * @param params - Total BTC and split sizing parameters
 * @returns Split result with vault sizes, seized fraction, target seizure and
 *   any sizing violation
 *
 * @example
 * ```typescript
 * import {
 *   computeOptimalSplit,
 *   EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
 *   SPLIT_TARGET_HEALTH_FACTOR,
 * } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * const result = computeOptimalSplit({
 *   totalBtc: 1_000_000_000n, // 10 BTC in sats
 *   CF: 0.78,
 *   LB: 1.0504,
 *   THF: SPLIT_TARGET_HEALTH_FACTOR,
 *   expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
 * });
 * // result.sacrificialVault === 285_716_677n (2.86 BTC)
 * // result.protectedVault === 714_283_323n (7.14 BTC)
 * ```
 */
export function computeOptimalSplit(
  params: OptimalSplitParams,
): OptimalSplitResult {
  const { totalBtc, CF, LB, THF, expectedHF } = params;

  const sizingViolation = findSplitSizingViolation({ CF, LB, THF, expectedHF });
  const seizedFraction = computeSeizedFraction(CF, LB, THF, expectedHF);

  if (totalBtc <= 0n) {
    return {
      sacrificialVault: 0n,
      protectedVault: 0n,
      seizedFraction: 0,
      targetSeizureBtc: 0n,
      sizingViolation,
    };
  }

  assertSafePrecision(totalBtc, "totalBtc");

  if (sizingViolation !== null) {
    return {
      sacrificialVault: 0n,
      protectedVault: 0n,
      seizedFraction,
      targetSeizureBtc: 0n,
      sizingViolation,
    };
  }

  const totalBtcNum = Number(totalBtc);
  const targetSeizureBtc = BigInt(Math.ceil(totalBtcNum * seizedFraction));
  const sacrificialVault = targetSeizureBtc;
  const protectedVault = totalBtc - sacrificialVault;

  // The share check above passed, but rounding up can still tie the two
  // vaults on a very small total.
  if (sacrificialVault >= protectedVault) {
    return {
      sacrificialVault: 0n,
      protectedVault: 0n,
      seizedFraction,
      targetSeizureBtc: 0n,
      sizingViolation: "sacrificial-not-smaller",
    };
  }

  // If either vault is non-zero but below the effective dust threshold for
  // HTLC outputs, the split is not viable — return zeroed vaults so the
  // caller treats this as non-splittable. We avoid throwing because this
  // function is called during render (useMemo) and throwing would crash
  // the component instead of showing validation feedback.
  if (
    (sacrificialVault > 0n &&
      sacrificialVault < HTLC_EFFECTIVE_DUST_THRESHOLD) ||
    (protectedVault > 0n && protectedVault < HTLC_EFFECTIVE_DUST_THRESHOLD)
  ) {
    return {
      sacrificialVault: 0n,
      protectedVault: 0n,
      seizedFraction,
      targetSeizureBtc: 0n,
      sizingViolation: null,
    };
  }

  return {
    sacrificialVault,
    protectedVault,
    seizedFraction,
    targetSeizureBtc,
    sizingViolation: null,
  };
}

/**
 * Compute the minimum total deposit required for a 2-vault split.
 *
 * Both vaults must be at least `minPegin` satoshis. This function returns
 * the minimum total deposit where both the sacrificial and protected vaults
 * would meet the minimum peg-in requirement.
 *
 * @param params - Minimum peg-in and seized fraction
 * @returns Minimum total deposit in satoshis. Returns 0n in two cases:
 *   - `seizedFraction >= 0.5`: split refused (the sacrificial vault would not
 *     be smaller than the protected vault)
 *   - `seizedFraction <= 0`: split not useful (no seizure expected at this health factor)
 *
 * @example
 * ```typescript
 * import { computeMinDepositForSplit } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * const minDeposit = computeMinDepositForSplit({
 *   minPegin: 50_000n, // 0.0005 BTC
 *   seizedFraction: 0.2857,
 * });
 * // minDeposit === 175_009n: 50_000 / 0.2857, rounded up
 * ```
 */
export function computeMinDepositForSplit(
  params: MinDepositForSplitParams,
): bigint {
  const { minPegin, seizedFraction } = params;

  assertSafePrecision(minPegin, "minPegin");

  // The sacrificial vault must stay smaller than the protected vault
  if (!(seizedFraction < MAX_SACRIFICIAL_SHARE)) {
    return 0n;
  }

  // If seized fraction is effectively zero, split is not useful
  if (seizedFraction <= 0) {
    return 0n;
  }

  // Minimum total so the protected vault >= minPegin
  const minFromProtected = Math.ceil(Number(minPegin) / (1 - seizedFraction));

  // Minimum total so the sacrificial vault >= minPegin
  const minFromSacrificial = Math.ceil(Number(minPegin) / seizedFraction);

  return BigInt(Math.max(minFromProtected, minFromSacrificial));
}
