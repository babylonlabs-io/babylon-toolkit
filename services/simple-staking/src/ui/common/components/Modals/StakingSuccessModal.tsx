import { useCallback } from "react";
import { useNavigate } from "react-router";

import { CoStakingBoostModal } from "./CoStakingBoostModal";

interface StakingSuccessModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Displays appropriate success modal after staking:
 * - CoStakingBoostModal if co-staking feature is enabled
 * - SuccessFeedbackModal otherwise
 *
 * Handles navigation to /baby page with co-staking prefill state when user
 * opts to boost their stake.
 */
export function StakingSuccessModal({
  open,
  onClose,
}: StakingSuccessModalProps) {
  const navigate = useNavigate();

  const handleSubmitBoost = useCallback(() => {
    onClose();

    // Navigate to baby page with flag to trigger prefill
    navigate("/baby", {
      state: {
        shouldPrefillCoStaking: true,
      },
    });
  }, [navigate, onClose]);

  return (
    <CoStakingBoostModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmitBoost}
    />
  );
}
