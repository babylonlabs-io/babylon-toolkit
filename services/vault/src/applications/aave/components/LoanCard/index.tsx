/**
 * LoanCard - Container for the Aave borrow/repay UI
 *
 * The borrow and repay flows live on separate screens; which one renders is
 * driven by the `tab` URL param (resolved into `defaultTab`). Repay only shows
 * when the user actually has a position — otherwise we fall back to borrow.
 *
 * Child components (Borrow, Repay) get their data from LoanContext and handle
 * their own transaction logic.
 */

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useLoanContext } from "../context/LoanContext";

import { Borrow } from "./Borrow";
import { Repay } from "./Repay";

export interface LoanCardProps {
  defaultTab?: LoanTab;
}

export function LoanCard({ defaultTab = LOAN_TAB.BORROW }: LoanCardProps) {
  const { collateralValueUsd, totalDebtValueUsd } = useLoanContext();

  const hasPosition = totalDebtValueUsd > 0 || collateralValueUsd > 0;
  const showRepay = defaultTab === LOAN_TAB.REPAY && hasPosition;

  return showRepay ? <Repay /> : <Borrow />;
}
