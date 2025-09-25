import { ExpansionHistoryModal } from "@/ui/common/components/ExpansionHistory/ExpansionHistoryModal";
import { getNetworkConfig } from "@/ui/common/config/network";
import { useActivityDelegations } from "@/ui/common/hooks/services/useActivityDelegations";
import { useStakingExpansionState } from "@/ui/common/state/StakingExpansionState";

import { ActivityCard } from "../../ActivityCard/ActivityCard";
import { DelegationModal } from "../../Delegations/DelegationList/components/DelegationModal";
import { StakingExpansionModalSystem } from "../../StakingExpansion/StakingExpansionModalSystem";

const networkConfig = getNetworkConfig();

export function ActivityList() {
  // All business logic is now centralized in this hook
  const {
    activityData,
    isLoading,
    processing,
    confirmationModal,
    executeDelegationAction,
    closeConfirmationModal,
    delegations,
  } = useActivityDelegations();

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
          src="/mascot-upset.png"
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

      <StakingExpansionModalSystem />

      <ExpansionHistoryModal
        open={expansionHistoryModalOpen}
        onClose={closeExpansionHistoryModal}
        targetDelegation={expansionHistoryTargetDelegation}
        allDelegations={delegations}
      />
    </>
  );
}
