import { useEffect } from "react";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { RepaySignModal } from "../modals/RepaySignModal";
import { RepaySuccessModal } from "../modals/RepaySuccessModal";
import { useRepayFlowState } from "./useRepayFlowState";

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

  const repayAmount = activity.borrowingData 
    ? `${activity.borrowingData.borrowedAmount} ${activity.borrowingData.borrowedSymbol}`
    : "0 USDC";
  const btcAmount = activity.collateral.amount;

  return (
    <>
      {/* Repay Sign Modal */}
      <RepaySignModal
        open={signModalOpen}
        onClose={handleSignModalClose}
        onSuccess={handleSignSuccess}
        pegInTxHash={activity.txHash}
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
