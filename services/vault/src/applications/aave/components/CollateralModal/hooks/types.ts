/**
 * Shared types for collateral modal hooks
 */

import type { DetailRow } from "@/components/shared";

export interface UseCollateralModalResult {
  /** Selected collateral amount in BTC */
  collateralAmount: number;
  /** Set the collateral amount */
  setCollateralAmount: (amount: number) => void;
  /** Maximum collateral amount */
  maxCollateralAmount: number;
  /** Collateral value in USD for selected amount */
  selectedCollateralValueUsd: number;
  /** Slider steps based on vault bucket combinations */
  collateralSteps: Array<{ value: number }>;
  /** Detail rows to display in the details card */
  detailRows: DetailRow[];
  /** Execute the transaction */
  handleSubmit: () => Promise<boolean>;
  /** Whether transaction is processing */
  isProcessing: boolean;
  /** Whether submit button should be disabled */
  isDisabled: boolean;
  /** Error message to display (e.g., "Must repay all debt first") */
  errorMessage?: string;
}
