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
  | "rebalance"
  | "reorder"
  | "dust"
  | "weird-params";

export interface Warning {
  type: WarningType;
  title: string;
  detail: string;
  suggestion?: string;
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
  recommendedSacrificialBtc: number;
  warnings: Warning[];
  isFullLiquidation: boolean;
  suggestedVaultOrder: Vault[] | null;
  /**
   * For single-vault positions: exact size of sacrificial vault to add
   * at position 1 so the existing vault becomes protected.
   * Accounts for the fact that adding a vault increases total BTC
   * and therefore increases target seizure.
   */
  suggestedNewVaultBtc: number | null;
  /**
   * For multi-vault rebalance: size of a new sacrificial vault to add.
   * Combines with existing small vaults to form the sacrificial group,
   * protecting the largest vault. null when liqFactor >= 1 or no improvement.
   */
  suggestedRebalanceVaultBtc: number | null;
  /**
   * The full vault order after adding the rebalance vault (includes the new vault).
   * Used by the UI to set the correct order in one click.
   */
  suggestedRebalanceOrder: Vault[] | null;
  /** How much additional BTC would be protected with optimal vault structure */
  rebalanceImprovementBtc: number;
}
