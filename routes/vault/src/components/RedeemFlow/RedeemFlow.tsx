import { useEffect } from "react";
import type { VaultActivity } from "../../types";
import { RedeemSignModal } from "./RedeemSignModal/RedeemSignModal";
import { RedeemSuccessModal } from "./RedeemSuccessModal/RedeemSuccessModal";
import { useRedeemFlowState } from "./useRedeemFlowState";
import type { Hex } from "viem";

interface RedeemFlowProps {
  activity: VaultActivity | null;
  isOpen: boolean;
  onClose: () => void;
  onRedeemSuccess?: () => void;
}

/**
 * RedeemFlow - Orchestrates the redeem flow for available vaults
 *
 * This flow redeems an available vault (not in a position) back to BTC.
 * Different from RepayFlow which repays debt from a position.
 */
export function RedeemFlow({ activity, isOpen, onClose, onRedeemSuccess }: RedeemFlowProps) {
  const {
    signModalOpen,
    successModalOpen,
    startRedeemFlow,
    handleSignSuccess,
    handleSignModalClose,
    handleSuccessClose,
  } = useRedeemFlowState();

  // Start the flow when opened with an activity
  useEffect(() => {
    if (isOpen && activity) {
      startRedeemFlow(activity);
    }
  }, [isOpen, activity, startRedeemFlow]);

  const handleFinalSuccess = async () => {
    handleSuccessClose();

    if (onRedeemSuccess) {
      await onRedeemSuccess();
    }

    onClose();
  };

  if (!activity) return null;

  // Extract redeem transaction data
  const pegInTxHash = activity.txHash || (activity.id as Hex); // Use txHash, fallback to id
  const btcAmount = activity.collateral.amount;

  return (
    <>
      {/* Redeem Sign Modal */}
      <RedeemSignModal
        open={signModalOpen}
        onClose={handleSignModalClose}
        onSuccess={handleSignSuccess}
        pegInTxHash={pegInTxHash}
      />

      {/* Redeem Success Modal */}
      <RedeemSuccessModal
        open={successModalOpen}
        onClose={handleFinalSuccess}
        btcAmount={btcAmount}
      />
    </>
  );
}
