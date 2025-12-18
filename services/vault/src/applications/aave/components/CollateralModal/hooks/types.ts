/**
 * Shared types for collateral modal hooks
 */

export interface UseCollateralModalResult {
  /** Selected collateral amount in BTC */
  collateralAmount: number;
  /** Set the collateral amount */
  setCollateralAmount: (amount: number) => void;
  /** Maximum collateral amount */
  maxCollateralAmount: number;
  /** Collateral value in USD for selected amount */
  selectedCollateralValueUsd: number;
  /** Current health factor value for UI (Infinity when no debt) */
  currentHealthFactorValue: number;
  /** Projected health factor value after adding/withdrawing collateral */
  projectedHealthFactorValue: number;
  /** Slider steps based on vault bucket combinations */
  collateralSteps: Array<{ value: number }>;
  /** Execute the transaction */
  handleSubmit: () => Promise<boolean>;
  /** Whether transaction is processing */
  isProcessing: boolean;
  /** Whether submit button should be disabled */
  isDisabled: boolean;
  /** Error message to display (e.g., "Must repay all debt first") */
  errorMessage?: string;
  /** Current debt value in USD (for withdraw modal to show outstanding debt) */
  currentDebtValueUsd?: number;
}
