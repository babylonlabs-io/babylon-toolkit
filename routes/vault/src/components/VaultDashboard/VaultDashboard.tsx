import { ActivityList } from "@babylonlabs-io/core-ui";
import { BorrowFlow } from "../BorrowFlow";
import { RepayFlow } from "../RepayFlow";
import { useVaultPositions } from "../../hooks/useVaultPositions";
import { useBorrowFlow } from "../../hooks/useBorrowFlow";
import { useRepayFlow } from "../../hooks/useRepayFlow";
import { EmptyState } from "./EmptyState";
import { VaultActivityCard } from "./VaultActivityCard";

export function VaultDashboard() {
  // Data fetching
  const { activities, isWalletConnected, refetchActivities } = useVaultPositions();

  // Borrow flow modal state
  const {
    isOpen: borrowFlowOpen,
    selectedActivity: selectedBorrowActivity,
    openBorrowFlow,
    closeBorrowFlow,
  } = useBorrowFlow();

  // Repay flow modal state
  const {
    isOpen: repayFlowOpen,
    selectedActivity: selectedRepayActivity,
    openRepayFlow,
    closeRepayFlow,
  } = useRepayFlow();

  // Handle "New Item" button click - open borrow for first activity
  const handleNewBorrow = () => {
    if (activities.length > 0) {
      openBorrowFlow(activities[0]);
    }
  };

  // Show message if wallet is not connected
  if (!isWalletConnected) {
    return <EmptyState />;
  }

  return (
    <>
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col px-4 py-8">
        <ActivityList onNewItem={handleNewBorrow}>
          {activities.map((activity) => (
            <VaultActivityCard
              key={activity.id}
              activity={activity}
              onBorrow={openBorrowFlow}
              onRepay={openRepayFlow}
            />
          ))}
        </ActivityList>
      </div>

      <BorrowFlow
        activity={selectedBorrowActivity}
        isOpen={borrowFlowOpen}
        onClose={closeBorrowFlow}
        onBorrowSuccess={refetchActivities}
      />

      <RepayFlow
        activity={selectedRepayActivity}
        isOpen={repayFlowOpen}
        onClose={closeRepayFlow}
        onRepaySuccess={refetchActivities}
      />
    </>
  );
}

