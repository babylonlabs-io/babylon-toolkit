import { useEffect } from "react";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { RepaySignModal } from "./RepaySignModal/RepaySignModal";
import { RepaySuccessModal } from "./RepaySuccessModal/RepaySuccessModal";
import { useRepayFlowState } from "./useRepayFlowState";
import { getFormattedRepayAmount } from "../../utils/peginTransformers";

interface RepayFlowProps {
  activity: VaultActivity | null;
  isOpen: boolean;
  onClose: () => void;
  onRepaySuccess?: () => void;
}

export function RepayFlow({ activity, isOpen, onClose, onRepaySuccess }: RepayFlowProps) {
  const {
    signModalOpen,
    successModalOpen,
    startRepayFlow,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  } = useRepayFlowState();

  // Start the flow when opened with an activity
  useEffect(() => {
    if (isOpen && activity) {
      startRepayFlow(activity);
    }
  }, [isOpen, activity, startRepayFlow]);

  const handleFinalSuccess = async () => {
    handleSuccessClose();

    if (onRepaySuccess) {
      await onRepaySuccess();
    }

    onClose();
  };

  if (!activity) return null;

  const repayAmount = getFormattedRepayAmount(activity);
  const btcAmount = activity.collateral.amount;

  // Get repay amount in wei for transaction
  const repayAmountWei = activity.morphoPosition?.borrowAssets;

  return (
    <>
      {/* Repay Sign Modal */}
      <RepaySignModal
        open={signModalOpen}
        onClose={handleSignModalClose}
        onSuccess={handleSignSuccess}
        pegInTxHash={activity.txHash}
        repayAmountWei={repayAmountWei}
      />

      {/* Repay Success Modal */}
      <RepaySuccessModal
        open={successModalOpen}
        onClose={handleFinalSuccess}
        repayAmount={repayAmount}
        btcAmount={btcAmount}
      />
    </>
  );
}
