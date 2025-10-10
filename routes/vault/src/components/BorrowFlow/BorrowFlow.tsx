import { BorrowModal } from "./BorrowModal";
import { BorrowSignModal } from "./BorrowSignModal/BorrowSignModal";
import { BorrowSuccessModal } from "./BorrowSuccessModal/BorrowSuccessModal";
import { useBorrowFlowState } from "./useBorrowFlowState";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { useEffect } from "react";

interface BorrowFlowProps {
  activity: VaultActivity | null;
  isOpen: boolean;
  onClose: () => void;
  onBorrowSuccess?: () => void;
}

export function BorrowFlow({ activity, isOpen, onClose, onBorrowSuccess }: BorrowFlowProps) {
  const {
    modalOpen,
    signModalOpen,
    successModalOpen,
    borrowAmount,
    startBorrowFlow,
    handleModalClose,
    handleBorrowClick,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  } = useBorrowFlowState();

  // Start the flow when opened with an activity
  useEffect(() => {
    if (isOpen && activity) {
      startBorrowFlow(activity);
    }
  }, [isOpen, activity, startBorrowFlow]);

  const handleClose = () => {
    handleModalClose();
    onClose();
  };

  const handleFinalSuccess = async () => {
    handleSuccessClose();

    // Refetch activities to show updated vault data before closing
    if (onBorrowSuccess) {
      await onBorrowSuccess();
    }

    onClose();
  };

  if (!activity) return null;

  return (
    <>
      {/* Borrow Modal */}
      <BorrowModal
        open={modalOpen}
        onClose={handleClose}
        onBorrow={handleBorrowClick}
        collateral={activity.collateral}
        marketData={activity.marketData}
        pegInTxHash={activity.txHash}
      />

      {/* Borrow Sign Modal */}
      <BorrowSignModal
        open={signModalOpen}
        onClose={handleSignModalClose}
        onSuccess={handleSignSuccess}
        borrowAmount={borrowAmount}
        collateralAmount={activity.collateral.amount}
        pegInTxHash={activity.txHash}
      />

      {/* Borrow Success Modal */}
      <BorrowSuccessModal
        open={successModalOpen}
        onClose={handleFinalSuccess}
        borrowAmount={borrowAmount}
      />
    </>
  );
}
