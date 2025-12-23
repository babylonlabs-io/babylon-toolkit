import { Avatar } from "@babylonlabs-io/core-ui";

import { SubmitModal } from "../../../../../../components/shared";

interface BorrowSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onViewLoan: () => void;
  borrowAmount: number;
  borrowSymbol: string;
  assetIcon: string;
}

/**
 * BorrowSuccessModal - Success modal for borrow operations
 *
 * Shows a success message with the borrowed amount and asset details.
 */
export function BorrowSuccessModal({
  open,
  onClose,
  onViewLoan,
  borrowAmount,
  borrowSymbol,
  assetIcon,
}: BorrowSuccessModalProps) {
  // Format amount with commas for readability
  const formattedBorrow = borrowAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <SubmitModal
      open={open}
      onClose={onClose}
      icon={<Avatar url={assetIcon} size="large" className="!h-24 !w-24" />}
      iconParentClassName="h-24 w-24 rounded-full"
      title="Borrow Successful"
      cancelButton=""
      submitButton="View Loan"
      onSubmit={onViewLoan}
    >
      {formattedBorrow} {borrowSymbol} has been borrowed and is now available in
      your wallet.
    </SubmitModal>
  );
}
