import { useCallback } from "react";
import { useNavigate } from "react-router";

import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { CoStakingBoostModal } from "./CoStakingBoostModal";
import { SuccessFeedbackModal } from "./SuccessFeedbackModal";

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

  if (FeatureFlagService.IsCoStakingEnabled) {
    return (
      <CoStakingBoostModal
        open={open}
        onClose={onClose}
        onSubmit={handleSubmitBoost}
      />
    );
  }

  return <SuccessFeedbackModal open={open} onClose={onClose} />;
}
