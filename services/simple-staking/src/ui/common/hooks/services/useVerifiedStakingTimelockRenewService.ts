import { useCallback, useMemo } from "react";

import { useUtxoValidation } from "@/ui/common/hooks/services/useUtxoValidation";
import { useDelegationV2State } from "@/ui/common/state/DelegationV2State";
import {
  DelegationV2,
  DelegationV2StakingState,
  DelegationWithFP,
} from "@/ui/common/types/delegationsV2";

import { useStakingTimelockRenewState } from "../../state/StakingTimelockRenewState";
import { StakingTimelockRenewStep } from "../../state/StakingTimelockRenewTypes";

/**
 * Hook providing verified staking renewal services.
 * Manifies verified renewals that are waiting for BTC signing and broadcast.
 */
export function useVerifiedStakingTimelockRenewService() {
  const {
    renewalDelegations,
    setVerifiedDelegation,
    goToStep,
    setVerifiedRenewalModalOpen,
    selectedDelegationForVerifiedRenewalModal,
    setSelectedDelegationForVerifiedRenewalModal,
  } = useStakingTimelockRenewState();
  const { findDelegationByTxHash } = useDelegationV2State();

  /**
   * Get all verified staking renewal delegations with valid UTXOs.
   * These are delegations that:
   * 1. Have state='VERIFIED'
   * 2. Have a previousStakingTxHashHex (indicating they are renewals)
   * 3. Are not mutually exclusive with already processed renewals
   * 4. Have valid funding UTXOs that are still available
   * 5. If a specific delegation is selected, filter to show only renewals for that delegation
   */
  const verifiedRenewalDelegations = useMemo(() => {
    // Helper function to get verified renewals without UTXO validation
    const getVerifiedRenewals = () => {
      // First, get all verified renewals
      const allVerified = renewalDelegations.filter(
        (r) =>
          r.state === DelegationV2StakingState.VERIFIED &&
          r.previousStakingTxHashHex,
      );

      // Filter out verified renewals if another renewal for the same original transaction
      // has already been broadcasted (mutual exclusivity)
      return allVerified.filter((renewal) => {
        // Check if any other renewal for the same original transaction is already being processed
        const hasProcessingRenewal = renewalDelegations.some(
          (other) =>
            other.previousStakingTxHashHex ===
              renewal.previousStakingTxHashHex &&
            other.stakingTxHashHex !== renewal.stakingTxHashHex && // Different renewal
            (other.state ===
              DelegationV2StakingState.INTERMEDIATE_PENDING_BTC_CONFIRMATION ||
              other.state === DelegationV2StakingState.ACTIVE), // Already processed
        );

        return !hasProcessingRenewal;
      });
    };

    // Get all verified renewals that aren't mutually exclusive
    const availableVerified = getVerifiedRenewals();

    return availableVerified;
  }, [renewalDelegations]);

  // Validate all verified renewals against available UTXOs
  const validationMap = useUtxoValidation(verifiedRenewalDelegations);

  // Filter verified renewals to only include those with valid UTXOs
  const validVerifiedRenewalDelegations = useMemo(() => {
    // Filter out renewals with invalid UTXOs
    const validRenewals = verifiedRenewalDelegations.filter(
      (renewal) => validationMap[renewal.stakingTxHashHex]?.valid !== false,
    );

    // If a specific delegation is selected for the modal, filter to only show renewals for that delegation
    if (selectedDelegationForVerifiedRenewalModal) {
      return validRenewals.filter(
        (renewal) =>
          renewal.previousStakingTxHashHex ===
          selectedDelegationForVerifiedRenewalModal.stakingTxHashHex,
      );
    }

    // Otherwise, return all valid verified renewals
    return validRenewals;
  }, [
    verifiedRenewalDelegations,
    validationMap,
    selectedDelegationForVerifiedRenewalModal,
  ]);

  /**
   * Open the verified renewal modal.
   */
  const openVerifiedRenewalModal = useCallback(() => {
    setVerifiedRenewalModalOpen(true);
  }, [setVerifiedRenewalModalOpen]);

  /**
   * Open the verified renewal modal for a specific delegation.
   */
  const openVerifiedRenewalModalForDelegation = useCallback(
    (delegation: DelegationWithFP) => {
      setSelectedDelegationForVerifiedRenewalModal(delegation);
      setVerifiedRenewalModalOpen(true);
    },
    [setSelectedDelegationForVerifiedRenewalModal, setVerifiedRenewalModalOpen],
  );

  /**
   * Resume a verified renewal.
   * This follows the same pattern as regular staking - one delegation at a time.
   * Closes the list modal and opens individual renewal modal.
   */
  const resumeVerifiedRenewal = useCallback(
    async (delegation: DelegationV2) => {
      // Set the verified delegation (same as regular staking pattern)
      setVerifiedDelegation(delegation);

      // Go to the verified step to show individual StakeModal
      goToStep(StakingTimelockRenewStep.VERIFIED);

      // The user will then click "Stake" in the individual StakeModal,
      // which will call stakeDelegationRenewal for this single delegation
    },
    [setVerifiedDelegation, goToStep],
  );

  /**
   * Get verified renewals for a specific original delegation.
   * This is useful when showing verified renewals related to a specific stake.
   * This already returns only valid renewals (with available UTXOs).
   */
  const getVerifiedRenewalsForDelegation = useCallback(
    (originalStakingTxHashHex: string) => {
      return validVerifiedRenewalDelegations.filter(
        (renewal) =>
          renewal.previousStakingTxHashHex === originalStakingTxHashHex,
      );
    },
    [validVerifiedRenewalDelegations],
  );

  /**
   * Get delegation-specific verified renewal info.
   * Returns count and boolean for a specific delegation.
   */
  const getVerifiedRenewalInfoForDelegation = useCallback(
    (originalStakingTxHashHex: string) => {
      const delegationRenewals = getVerifiedRenewalsForDelegation(
        originalStakingTxHashHex,
      );
      return {
        count: delegationRenewals.length,
        hasVerifiedRenewals: delegationRenewals.length > 0,
        renewals: delegationRenewals,
      };
    },
    [getVerifiedRenewalsForDelegation],
  );

  /**
   * Check if a delegation has a verified timelock renewal expansion.
   * This is used to disable the "Renew Staking Term" button when a renewal is already verified.
   */
  const hasVerifiedTimelockRenewal = useCallback(
    (originalStakingTxHashHex: string) => {
      // Get all verified expansions for this delegation
      const delegationRenewals = getVerifiedRenewalsForDelegation(
        originalStakingTxHashHex,
      );

      // Check if any of the verified expansions is a pure timelock renewal
      return delegationRenewals.some((renewal) => {
        // Find the original delegation using the same method as VerifiedStakeExpansionModal
        const originalDelegation = renewal.previousStakingTxHashHex
          ? findDelegationByTxHash(renewal.previousStakingTxHashHex)
          : undefined;

        return !!originalDelegation;
      });
    },
    [getVerifiedRenewalsForDelegation, findDelegationByTxHash],
  );

  return {
    verifiedRenewals: validVerifiedRenewalDelegations,
    openVerifiedRenewalModal,
    openVerifiedRenewalModalForDelegation,
    resumeVerifiedRenewal,
    getVerifiedRenewalsForDelegation,
    getVerifiedRenewalInfoForDelegation,
    hasVerifiedTimelockRenewal,
  };
}
