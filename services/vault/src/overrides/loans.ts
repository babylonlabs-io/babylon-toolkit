import type { ActiveLoanRow } from "@/applications/aave/hooks/useActiveLoans";

import { createOverrideStore } from "./store";

export interface LoanOverride {
  rows: ActiveLoanRow[];
  /** Total mock debt in USD — the Loans summary totals the rendered rows. */
  debtUsd: number;
  hideReal: boolean;
}

const loanOverrideStore = createOverrideStore<LoanOverride>();

export const useLoanOverride = loanOverrideStore.useValue;
export const setLoanOverride = loanOverrideStore.set;
