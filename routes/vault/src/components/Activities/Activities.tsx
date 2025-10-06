import {
  ActivityCard,
  StatusBadge,
  ActivityList,
  type ActivityCardData,
  type ActivityCardDetailItem,
  ProviderItem,
} from "@babylonlabs-io/core-ui";
import { BorrowFlow } from "../BorrowFlow";
import { useActivitiesState } from "./useActivitiesState";

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
    const hasBorrowed = activity.morphoPosition && activity.morphoPosition.borrowShares > 0n;

    // Only active vaults can borrow
    const isActive = activity.status.variant === 'active';

    // Build details array, adding borrowing data if available
    const details: ActivityCardDetailItem[] = [statusDetail, providersDetail];

    // Add borrowing details if user has borrowed
    if (activity.borrowingData) {
      details.push({
        label: "Borrowed",
        value: `${activity.borrowingData.borrowedAmount} ${activity.borrowingData.borrowedSymbol}`,
      });
      // Only show LTV if it's calculated (non-zero)
      // TODO: Implement BTC price oracle to calculate accurate current LTV
      if (activity.borrowingData.currentLTV > 0) {
        details.push({
          label: "Current LTV",
          value: `${activity.borrowingData.currentLTV}%`,
        });
      }
      details.push({
        label: "Max LTV (LLTV)",
        value: `${activity.borrowingData.maxLTV}%`,
      });
    }

    return {
      formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
      icon: activity.collateral.icon,
      iconAlt: activity.collateral.symbol,
      details,
      // Show borrow button if vault is active and user hasn't borrowed yet
      primaryAction: (isActive && !hasBorrowed) ? {
        label: activity.action.label,
        onClick: () => handleActivityBorrow(activity),
      } : undefined,
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
    </>
  );
}

