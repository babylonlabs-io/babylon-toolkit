/**
 * Loan Context
 *
 * Provides user's Aave position data to the borrow UI.
 * All values come from Aave's on-chain oracle.
 */

import { createContext, useContext } from "react";

export interface LoanContextValue {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** Current health factor (null if no debt) */
  healthFactor: number | null;
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
