import { BorrowModal } from "./BorrowModal";
import { BorrowSignModal } from "./BorrowSignModal/BorrowSignModal";
import { BorrowSuccessModal } from "./BorrowSuccessModal/BorrowSuccessModal";
import { useBorrowFlowState } from "./useBorrowFlowState";
import type { Hex } from "viem";
import { useEffect } from "react";

interface BorrowFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onBorrowSuccess?: () => void;
  /** User's Ethereum address */
  connectedAddress?: Hex;
}

export function BorrowFlow({ isOpen, onClose, onBorrowSuccess, connectedAddress }: BorrowFlowProps) {
  const {
    modalOpen,
    signModalOpen,
    successModalOpen,
    borrowAmount,
    marketId,
    selectedCollateralTxHashes,
    startBorrowFlow,
    handleModalClose,
    handleBorrowClick,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  } = useBorrowFlowState();

  // Start the flow when opened
  useEffect(() => {
    if (isOpen) {
      startBorrowFlow();
    }
  }, [isOpen, startBorrowFlow]);

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

  return (
    <>
      {/* Borrow Modal */}
      <BorrowModal
        open={modalOpen}
        onClose={handleClose}
        onBorrow={handleBorrowClick}
        connectedAddress={connectedAddress}
      />

      {/* Borrow Sign Modal */}
      <BorrowSignModal
        open={signModalOpen}
        onClose={handleSignModalClose}
        onSuccess={handleSignSuccess}
        borrowAmount={borrowAmount}
        pegInTxHashes={selectedCollateralTxHashes}
        marketId={marketId}
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
