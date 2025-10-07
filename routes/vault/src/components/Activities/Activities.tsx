import {
  ActivityCard,
  StatusBadge,
  ActivityList,
  type ActivityCardData,
  type ActivityCardDetailItem,
  type ActivityCardActionButton,
  ProviderItem,
} from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { BorrowFlow } from "../BorrowFlow";
import { RepayFlow } from "../RepayFlow";
import { useActivitiesState } from "./useActivitiesState";

function getPrimaryAction(
  activity: VaultActivity,
  hasBorrowed: boolean,
  isActive: boolean,
  onBorrow: (activity: VaultActivity) => void,
  onRepay: (activity: VaultActivity) => void
): ActivityCardActionButton | undefined {
  if (hasBorrowed) {
    return {
      label: "Repay and Withdraw BTC",
      onClick: () => onRepay(activity),
      variant: "outlined",
      fullWidth: true,
    };
  }
  
  if (isActive && !hasBorrowed) {
    return {
      label: "Borrow USDC",
      onClick: () => onBorrow(activity),
      variant: "outlined",
      fullWidth: true,
    };
  }
  
  return undefined;
}

export function Activities() {
  const {
    activities,
    borrowFlowOpen,
    selectedActivity,
    handleNewBorrow,
    handleActivityBorrow,
    handleBorrowFlowClose,
    isWalletConnected,
    refetchActivities,
  } = useActivitiesState();

  // Repay flow state
  const [repayFlowOpen, setRepayFlowOpen] = useState(false);
  const [selectedRepayActivity, setSelectedRepayActivity] = useState<VaultActivity | null>(null);

  const handleRepayAndWithdraw = useCallback((activity: VaultActivity) => {
    console.log('[Activities] Repay and withdraw for:', activity.id);
    setSelectedRepayActivity(activity);
    setRepayFlowOpen(true);
  }, []);

  const handleRepayFlowClose = useCallback(() => {
    setRepayFlowOpen(false);
    setSelectedRepayActivity(null);
  }, []);

  console.log('[Activities] activities:', activities);
  console.log('[Activities] activities.length:', activities.length);

  // Show message if wallet is not connected
  if (!isWalletConnected) {
    return (
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-semibold">Connect Your Wallet</h2>
          <p className="text-gray-600">Please connect your wallet to view your vault activities</p>
        </div>
      </div>
    );
  }

  // Transform vault activities to ActivityCard data format
  const activityCardData: ActivityCardData[] = activities.map((activity) => {
    // Create status detail using StatusBadge element
    const statusDetail: ActivityCardDetailItem = {
      label: "Status",
      value: (
        <StatusBadge
          status={activity.status.variant as "active" | "inactive" | "pending"}
          label={activity.status.label}
        />
      ),
    };

    // Create providers detail using ProviderItem elements
    const providersDetail: ActivityCardDetailItem = {
      label: "Vault Provider(s)",
      value: (
        <div className="flex flex-wrap gap-2">
          {activity.providers.map((provider) => (
            <ProviderItem
              key={provider.id}
              name={provider.name}
              icon={provider.icon}
            />
          ))}
        </div>
      ),
    };

    // Check if user has already borrowed (has borrow shares > 0)
    const hasBorrowed = !!(activity.morphoPosition && activity.morphoPosition.borrowShares > 0n);

    // Only active vaults can borrow
    const isActive = activity.status.variant === 'active';

    // Build main details array
    const details: ActivityCardDetailItem[] = [statusDetail, providersDetail];

    // Build optional details array for loan information (shown in separate section)
    const optionalDetails: ActivityCardDetailItem[] = [];
    
    if (activity.borrowingData) {
      // Add loan details section header
      optionalDetails.push({
        label: (
          <div className="space-y-1">
            <div className="text-base font-semibold text-accent-primary">Loan Details</div>
            <div className="text-xs text-accent-secondary">Your current loan</div>
          </div>
        ),
        value: "",
      });
      
      // Add loan amount
      optionalDetails.push({
        label: "Loan",
        value: `${activity.borrowingData.borrowedAmount} ${activity.borrowingData.borrowedSymbol}`,
      });
      
      // Add LTV (only if calculated)
      if (activity.borrowingData.currentLTV > 0) {
        optionalDetails.push({
          label: "LTV",
          value: `${activity.borrowingData.currentLTV}%`,
        });
      }
      
      // Add liquidation LTV
      optionalDetails.push({
        label: "Liquidation LTV",
        value: `${activity.borrowingData.maxLTV}%`,
      });
    }

    return {
      formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
      icon: activity.collateral.icon,
      iconAlt: activity.collateral.symbol,
      details,
      optionalDetails: optionalDetails.length > 0 ? optionalDetails : undefined,
      // Use helper function for cleaner conditional button logic
      primaryAction: getPrimaryAction(
        activity,
        hasBorrowed,
        isActive,
        handleActivityBorrow,
        handleRepayAndWithdraw
      ),
    };
  });

  return (
    <>
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col px-4 py-8">
        <ActivityList onNewItem={handleNewBorrow}>
          {activityCardData.map((data, index) => (
            <ActivityCard key={activities[index].id} data={data} />
          ))}
        </ActivityList>
      </div>

      <BorrowFlow
        activity={selectedActivity}
        isOpen={borrowFlowOpen}
        onClose={handleBorrowFlowClose}
        onBorrowSuccess={refetchActivities}
      />

      <RepayFlow
        activity={selectedRepayActivity}
        isOpen={repayFlowOpen}
        onClose={handleRepayFlowClose}
        onRepaySuccess={refetchActivities}
      />
    </>
  );
}

