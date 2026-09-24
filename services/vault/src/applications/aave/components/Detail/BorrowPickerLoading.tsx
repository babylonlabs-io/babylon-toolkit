/**
 * BorrowPickerLoading
 *
 * Stands in for a borrow picker while the Spoke's borrow count is still
 * resolving. Showing either picker now would offer every reserve to an account
 * that may already be at the cap.
 *
 * The cap itself is known here — only the count is missing — so the notice is
 * carried through rather than popping in once the count lands and shifting the
 * list under the cursor.
 */

import { COPY } from "@/copy";

import { BorrowLimitNotice, type BorrowPickerMode } from "../BorrowLimitNotice";
import { LoanPickerFrame } from "../LoanPickerFrame";

interface BorrowPickerLoadingProps {
  /** Which picker this is standing in for. */
  mode: BorrowPickerMode;
  limit: number;
}

export function BorrowPickerLoading({ mode, limit }: BorrowPickerLoadingProps) {
  return (
    <LoanPickerFrame
      title={
        mode === "hub"
          ? COPY.loans.hub.selectTitle
          : COPY.loans.assetSelection.title
      }
      notice={<BorrowLimitNotice mode={mode} limit={limit} />}
    >
      <p className="py-4 text-center text-accent-secondary">
        {COPY.loans.assetSelection.loading}
      </p>
    </LoanPickerFrame>
  );
}
