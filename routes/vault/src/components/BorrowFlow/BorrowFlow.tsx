import { BorrowModal, BorrowSignModal, BorrowSuccessModal } from "../modals";
import { useBorrowFlowState } from "./useBorrowFlowState";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { useEffect } from "react";

interface BorrowFlowProps {
  activity: VaultActivity | null;
  isOpen: boolean;
  onClose: () => void;
}

export function BorrowFlow({ activity, isOpen, onClose }: BorrowFlowProps) {
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

  const handleFinalSuccess = () => {
    handleSuccessClose();
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
      />

      {/* Borrow Sign Modal */}
      <BorrowSignModal
        open={signModalOpen}
        onClose={handleSignModalClose}
        onSuccess={handleSignSuccess}
        borrowAmount={borrowAmount}
        collateralAmount={activity.collateral.amount}
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
