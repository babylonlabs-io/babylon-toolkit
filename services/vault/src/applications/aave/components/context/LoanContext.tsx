/**
 * Loan Context
 *
 * Provides user's Aave position data and reserve config to borrow/repay UI.
 * All USD values come from Aave's on-chain oracle.
 */

import { createContext, useContext } from "react";

import type { AaveReserveConfig } from "../../services/fetchConfig";
import type { Asset } from "../../types";

export interface LoanContextValue {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt amount for selected reserve in token units */
  currentDebtAmount: number;
  /** Total debt value in USD across all reserves (from Aave oracle) */
  totalDebtValueUsd: number;
  /** Current health factor (null if no debt) */
  healthFactor: number | null;
  /** Liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Selected reserve to borrow from */
  selectedReserve: AaveReserveConfig;
  /** Asset display config (icon, name, symbol) */
  assetConfig: Asset;
  /** User's proxy contract address (for debt queries) */
  proxyContract: string | undefined;
  /** Callback when borrow succeeds */
  onBorrowSuccess: (borrowAmount: number) => void;
  /** Callback when repay succeeds */
  onRepaySuccess: (repayAmount: number, withdrawAmount: number) => void;
}

const LoanContext = createContext<LoanContextValue | null>(null);

interface LoanProviderProps {
  children: React.ReactNode;
  value: LoanContextValue;
}

export function LoanProvider({ children, value }: LoanProviderProps) {
  return <LoanContext.Provider value={value}>{children}</LoanContext.Provider>;
}

export function useLoanContext(): LoanContextValue {
  const ctx = useContext(LoanContext);
  if (!ctx) {
    throw new Error("useLoanContext must be used within a LoanProvider");
  }
  return ctx;
}
