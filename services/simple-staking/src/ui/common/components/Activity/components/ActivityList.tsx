import { useCallback, useMemo } from "react";

import { ExpansionHistoryModal } from "@/ui/common/components/ExpansionHistory/ExpansionHistoryModal";
import { TimelockRenewalModalSystem } from "@/ui/common/components/TimelockRenewal/TimelockRenewalModalSystem";
import { getNetworkConfig } from "@/ui/common/config/network";
import { useActivityDelegations } from "@/ui/common/hooks/services/useActivityDelegations";
import { useVerifiedStakingExpansionService } from "@/ui/common/hooks/services/useVerifiedStakingExpansionService";
import { useStakingExpansionService } from "@/ui/common/hooks/services/useStakingExpansionService";
import { useNetworkFees } from "@/ui/common/hooks/client/api/useNetworkFees";
import { getFeeRateFromMempool } from "@/ui/common/utils/getFeeRateFromMempool";
import { useFinalityProviderState } from "@/ui/common/state/FinalityProviderState";
import { useStakingExpansionState } from "@/ui/common/state/StakingExpansionState";
import { StakingExpansionStep } from "@/ui/common/state/StakingExpansionTypes";
import { DelegationV2 } from "@/ui/common/types/delegationsV2";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";
import { useAppState } from "@/ui/common/state";
import { IS_FIXED_TERM_FIELD } from "@/ui/common/config";
import { validateDelegation } from "@/ui/common/utils/delegations";

import { ActivityCard } from "../../ActivityCard/ActivityCard";
import { DelegationModal } from "../../Delegations/DelegationList/components/DelegationModal";

const networkConfig = getNetworkConfig();

export function ActivityList() {
  const { getRegisteredFinalityProvider } = useFinalityProviderState();
  const { goToStep, setFormData, setVerifiedDelegation } =
    useStakingExpansionState();
  const { hasVerifiedTimelockRenewal, getVerifiedExpansionsForDelegation } =
    useVerifiedStakingExpansionService();
  const { calculateExpansionFeeAmount } = useStakingExpansionService();
  const { data: networkFees } = useNetworkFees();
  const { defaultFeeRate } = getFeeRateFromMempool(networkFees);
  const { networkInfo, availableUTXOs } = useAppState();

  // Calculate default staking timelock from network parameters (same logic as regular staking)
  const defaultStakingTimeBlocks = useMemo(() => {
    const latestParam = networkInfo?.params.bbnStakingParams?.latestParam;
    if (!latestParam) {
      return 64000; // fallback to current hardcoded value
    }

    const { minStakingTimeBlocks = 0, maxStakingTimeBlocks = 0 } = latestParam;

    // Use the exact same logic as regular staking
    return IS_FIXED_TERM_FIELD || minStakingTimeBlocks === maxStakingTimeBlocks
      ? maxStakingTimeBlocks
      : 64000; // fallback for variable terms
  }, [networkInfo]);

  const openRenewalModal = useCallback(
    async (delegation: DelegationV2) => {
      if (hasVerifiedTimelockRenewal(delegation.stakingTxHashHex)) {
        const verifiedExpansions = getVerifiedExpansionsForDelegation(
          delegation.stakingTxHashHex,
        );
        const verifiedRenewal = verifiedExpansions.find((expansion) => {
          const newFPs = expansion.finalityProviderBtcPksHex.filter(
            (fp) => !delegation.finalityProviderBtcPksHex.includes(fp),
          );
          return newFPs.length === 0;
        });

        if (verifiedRenewal) {
          // Validate that the verified renewal still has valid UTXOs
          const validation = validateDelegation(
            verifiedRenewal,
            availableUTXOs || [],
          );

          if (!validation.valid) {
            // Invalid UTXOs - skip this verified renewal
          } else {
            const verifiedFp = getRegisteredFinalityProvider(
              verifiedRenewal.finalityProviderBtcPksHex[0],
            );

            if (verifiedFp) {
              setFormData({
                originalDelegation: { ...delegation, fp: verifiedFp },
                selectedBsnFps: {},
                feeRate: 0,
                feeAmount: 0, // Not needed for verified
                stakingTimelock: verifiedRenewal.stakingTimelock,
                isRenewalOnly: true,
              });
            }

            setVerifiedDelegation(verifiedRenewal);
            goToStep(StakingExpansionStep.VERIFIED);
            return;
          }
        }
      }

      // No verified renewal found, proceed with normal renewal flow
      // Get the finality provider for this delegation
      const fp = getRegisteredFinalityProvider(
        delegation.finalityProviderBtcPksHex[0],
      );

      if (!fp) {
        return;
      }

      // Create delegation with FP
      const delegationWithFP = { ...delegation, fp };

      // Default renewal term from network parameters and fee rate from mempool
      const stakingTimelock = defaultStakingTimeBlocks;
      const feeRate =
        Number.isFinite(defaultFeeRate) && defaultFeeRate > 0
          ? defaultFeeRate
          : 5; // fallback

      // Prepare preliminary form data so we can calculate fee
      const preliminaryFormData = {
        originalDelegation: delegationWithFP,
        selectedBsnFps: {},
        feeRate,
        feeAmount: 0,
        stakingTimelock,
        isRenewalOnly: true,
      } as const;

      try {
        const feeAmount = await calculateExpansionFeeAmount(
          preliminaryFormData as any,
        );
        setFormData({
          ...preliminaryFormData,
          feeAmount,
        } as any);
        goToStep(StakingExpansionStep.PREVIEW);
      } catch {
        setFormData(preliminaryFormData as any);
        goToStep(StakingExpansionStep.PREVIEW);
      }
    },
    [
      getRegisteredFinalityProvider,
      setFormData,
      goToStep,
      setVerifiedDelegation,
      hasVerifiedTimelockRenewal,
      getVerifiedExpansionsForDelegation,
      calculateExpansionFeeAmount,
      defaultFeeRate,
      defaultStakingTimeBlocks,
      availableUTXOs,
    ],
  );

  // All business logic is now centralized in this hook
  const {
    activityData,
    isLoading,
    processing,
    confirmationModal,
    executeDelegationAction,
    closeConfirmationModal,
    delegations,
  } = useActivityDelegations(
    FeatureFlagService.IsTimelockRenewalEnabled ? openRenewalModal : undefined,
  );

  const {
    expansionHistoryModalOpen,
    expansionHistoryTargetDelegation,
    closeExpansionHistoryModal,
  } = useStakingExpansionState();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-accent-secondary">Loading delegations...</div>
      </div>
    );
  }

  if (activityData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pb-16 pt-6 text-center text-accent-primary">
        <img
          src="/mascot.png"
          alt="Empty state mascot illustration"
          className="size-[300px]"
        />
        <h4 className="text-xl font-semibold text-accent-primary">
          No {networkConfig.bbn.networkFullName} Stakes
        </h4>
        <p className="text-base text-accent-secondary">No activity found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {activityData.map((data, index) => (
          <ActivityCard
            key={delegations[index]?.stakingTxHashHex || index}
            data={data}
          />
        ))}
      </div>

      <DelegationModal
        action={confirmationModal?.action}
        delegation={confirmationModal?.delegation ?? null}
        param={confirmationModal?.param ?? null}
        processing={processing}
        onSubmit={executeDelegationAction}
        onClose={closeConfirmationModal}
        networkConfig={networkConfig}
      />

      {/* COMMENTED OUT: Phase-3 expansion modal system removed */}
      {/* <StakingExpansionModalSystem /> */}

      {FeatureFlagService.IsTimelockRenewalEnabled && (
        <TimelockRenewalModalSystem />
      )}

      <ExpansionHistoryModal
        open={expansionHistoryModalOpen}
        onClose={closeExpansionHistoryModal}
        targetDelegation={expansionHistoryTargetDelegation}
        allDelegations={delegations}
      />
    </>
  );
}
