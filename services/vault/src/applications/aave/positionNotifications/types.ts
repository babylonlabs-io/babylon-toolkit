import type {
  CascadeVault,
  LiquidationBonusCurve,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

export interface Vault extends CascadeVault {
  name: string;
}

export interface LiquidationGroup {
  index: number;
  vaults: Vault[];
  combinedBtc: number;
  /** The price at which the group's position reaches health factor 1. */
  liquidationPrice: number;
  /**
   * The price the group's seizure and repayment are worked out at:
   * `liquidationPrice`, or the lower market price when BTC is already below
   * that trigger.
   */
  executionPrice: number;
  distancePct: number;
  targetSeizureBtc: number;
  overSeizureBtc: number;
  /**
   * Every remaining vault is seized. On the path the liquidator repays all the
   * debt. After a gap any debt the seized BTC can't cover is written off, so
   * `debtRepaid` can be less than the debt and `debtRemainingAfter` still 0.
   */
  isFullLiquidation: boolean;
  /** Aave close-factor portion (fair amount) */
  debtToRepay: number;
  liquidatorProfitUsd: number;
  /** Total debt cleared this group */
  debtRepaid: number;
  /** The part of `debtRepaid` that over-seizure paid for. 0 on a full path group. */
  fairnessDebtRepay: number;
  /** Fairness payment to the borrower in USD, when the debt clears first */
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
  /**
   * The market price now. A group whose trigger is above it is seized at this
   * price, since that liquidation can no longer execute any higher.
   */
  btcPrice: number;
  totalDebtUsd: number;
  vaults: Vault[];
  CF: number;
  /** Split target health factor (`VaultSplitParams.THF`) */
  THF: number;
  /** Liquidation bonus at `expectedHF` (`VaultSplitParams.LB`) */
  LB: number;
  /**
   * The Spoke's bonus curve (`VaultSplitParams.bonusCurve`). A seizure below
   * its trigger reads the bonus here, at the health factor before that seizure.
   */
  bonusCurve: LiquidationBonusCurve;
  /** Expected health factor at liquidation (`VaultSplitParams.expectedHF`) */
  expectedHF: number;
  /**
   * Protocol minimum peg-in, in BTC. A suggested new vault is never smaller,
   * so the deposit form accepts the amount the banner pre-fills. `null` when
   * the peg-in configuration could not be read: suggestions are then not
   * floored, and every warning still renders.
   */
  minPeginBtc: number | null;
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
   * Order" action, unless the first event is already below its trigger, where
   * the contract would refuse the reorder. Re-derived by
   * `assertOptimalOrderMatchesOnChain` at every price.
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
