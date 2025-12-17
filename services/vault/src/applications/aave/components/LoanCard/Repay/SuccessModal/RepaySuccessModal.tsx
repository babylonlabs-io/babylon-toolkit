import { Avatar } from "@babylonlabs-io/core-ui";

import { SubmitModal } from "../../../../../../components/shared";
import { formatAmount } from "../../../../../../utils/formatting";

interface RepaySuccessModalProps {
  open: boolean;
  onClose: () => void;
  onViewLoan: () => void;
  repayAmount: number;
  repaySymbol: string;
  assetIcon: string;
}

/**
 * RepaySuccessModal - Success modal for repay operations
 *
 * Shows a success message with the repaid amount and asset details.
 */
export function RepaySuccessModal({
  open,
  onClose,
  onViewLoan,
  repayAmount,
  repaySymbol,
  assetIcon,
}: RepaySuccessModalProps) {
  const formattedRepay = formatAmount(repayAmount);

  return (
    <SubmitModal
      open={open}
      onClose={onClose}
      icon={<Avatar url={assetIcon} size="large" className="!h-24 !w-24" />}
      iconParentClassName="h-24 w-24 rounded-full"
      title="Repay Successful"
      cancelButton={undefined}
      submitButton="View Loan"
      onSubmit={onViewLoan}
    >
      {formattedRepay} {repaySymbol} has been successfully repaid.
    </SubmitModal>
  );
}
