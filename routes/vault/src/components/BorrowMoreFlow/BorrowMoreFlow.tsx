import { useEffect } from "react";
import type { VaultActivity } from "../../types";
import { BorrowMoreModal } from "./BorrowMoreModal/BorrowMoreModal";
import { BorrowMoreSuccessModal } from "./BorrowMoreSuccessModal/BorrowMoreSuccessModal";
import { useBorrowMoreFlowState } from "./useBorrowMoreFlowState";

interface BorrowMoreFlowProps {
  activity: VaultActivity | null;
  isOpen: boolean;
  onClose: () => void;
  onBorrowMoreSuccess?: () => void;
}

/**
 * BorrowMoreFlow - Orchestrates the borrow more flow for existing positions
 *
 * Allows users to borrow additional funds from their position without adding collateral.
 */
export function BorrowMoreFlow({ activity, isOpen, onClose, onBorrowMoreSuccess }: BorrowMoreFlowProps) {
  const {
    borrowMoreModalOpen,
    successModalOpen,
    startBorrowMoreFlow,
    handleBorrowMoreSuccess,
    handleBorrowMoreModalClose,
    handleSuccessClose,
  } = useBorrowMoreFlowState();

  // Start the flow when opened with an activity
  useEffect(() => {
    if (isOpen && activity) {
      startBorrowMoreFlow(activity);
    }
  }, [isOpen, activity, startBorrowMoreFlow]);

  const handleFinalSuccess = async () => {
    handleSuccessClose();

    if (onBorrowMoreSuccess) {
      await onBorrowMoreSuccess();
    }

    onClose();
  };

  if (!activity) return null;

  // Extract data from activity
  const marketId = activity.marketId;
  const borrowedSymbol = activity.borrowingData?.borrowedSymbol || "USDC";
  const currentLTV = activity.borrowingData?.currentLTV || 0;
  const liquidationLTV = activity.borrowingData?.maxLTV || 0;

  return (
    <>
      {/* Borrow More Modal */}
      <BorrowMoreModal
        open={borrowMoreModalOpen}
        onClose={handleBorrowMoreModalClose}
        onSuccess={handleBorrowMoreSuccess}
        marketId={marketId}
        borrowedSymbol={borrowedSymbol}
        currentLTV={currentLTV}
        liquidationLTV={liquidationLTV}
      />

      {/* Borrow More Success Modal */}
      <BorrowMoreSuccessModal
        open={successModalOpen}
        onClose={handleFinalSuccess}
      />
    </>
  );
}
