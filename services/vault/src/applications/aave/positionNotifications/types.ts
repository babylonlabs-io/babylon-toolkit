import type { CascadeVault } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

export interface Vault extends CascadeVault {
  name: string;
}

export interface LiquidationGroup {
  index: number;
  vaults: Vault[];
  combinedBtc: number;
  liquidationPrice: number;
  distancePct: number;
  targetSeizureBtc: number;
  overSeizureBtc: number;
  /** Last group: liquidator repays ALL debt */
  isFullLiquidation: boolean;
  /** Aave close-factor portion (fair amount) */
  debtToRepay: number;
  liquidatorProfitUsd: number;
  /** Total debt cleared this group */
  debtRepaid: number;
  /** Safe groups only: over-seizure converted to debt reduction */
  fairnessDebtRepay: number;
  /** Full group only: fairness payment to borrower in USD */
  fairnessPaymentUsd: number;
  debtRemainingAfter: number;
  btcRemainingAfter: number;
}

export type WarningType =
  | "urgent"
  | "cliff"
  | "reorder"
  | "dust"
  | "weird-params"
  | "too-many-vaults";

export interface Warning {
  type: WarningType;
  title: string;
  detail: string;
  suggestion?: string;
  /**
   * "soft" = advisory. The banner renders these in a muted gray tone instead of
   * the default severity styling. Omit for standard severity.
   */
  tone?: "soft";
}

export interface CalculatorParams {
  btcPrice: number;
  totalDebtUsd: number;
  vaults: Vault[];
  CF: number;
  THF: number;
  maxLB: number;
  expectedHF?: number;
}

export interface CalculatorResult {
  groups: LiquidationGroup[];
  currentHF: number;
  collateralValue: number;
  targetSeizureBtc: number;
  warnings: Warning[];
  /**
   * The liquidation-optimal vault order the calculator settled on, or `null`
   * when no reorder strictly helps (or under invalid/dust params). Surfaced in
   * the reorder notification as the optimal-order chips and the "Apply Optimal
   * Order" action, and re-derived by `assertOptimalOrderMatchesOnChain`.
   * (The reference calculator calls this `suggestedVaultOrder`.)
   */
  optimalVaultOrder: Vault[] | null;
  /**
   * Single-vault cliff only: exact size of a sacrificial vault to add at
   * position 1 so the existing vault becomes protected. Accounts for the new
   * vault increasing total BTC (and therefore target seizure). `null` when not
   * actionable (extreme params, or the amount would exceed the position).
   */
  suggestedNewVaultBtc: number | null;
}
