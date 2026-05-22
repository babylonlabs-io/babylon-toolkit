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

export type WarningType = "urgent" | "dust" | "weird-params";

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
   * The liquidation-optimal vault order the calculator settled on. The group
   * breakdown is computed against this order. Null on early exits (no debt /
   * dust). Not surfaced in the banner yet — consumed by the (deferred)
   * auto-reorder-on-EVM-action flow.
   */
  suggestedVaultOrder: Vault[] | null;
}
