import {
  ActivityCard,
  StatusBadge,
  BorrowCard,
  type ActivityCardData,
  type ActivityCardDetailItem,
  ProviderItem,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { mockVaultActivities, type VaultActivity } from "../../mockData/vaultActivities";
import { BorrowModal } from "../modals";

export function Borrow() {
  const [activities] = useState<VaultActivity[]>(mockVaultActivities);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<VaultActivity | null>(null);

  const handleNewBorrow = () => {
    if (activities.length > 0) {
      // TODO: getSelectedActivity method should be implemented
      setSelectedActivity(activities[0]);
      setModalOpen(true);
    }
  };

  const handleActivityBorrow = (activity: VaultActivity) => {
    setSelectedActivity(activity);
    setModalOpen(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedActivity(null);
  };

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

    return {
      formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
      icon: activity.collateral.icon,
      iconAlt: activity.collateral.symbol,
      details: [statusDetail, providersDetail],
      primaryAction: {
        label: activity.action.label,
        onClick: () => handleActivityBorrow(activity),
      },
    };
  });

  return (
    <>
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col px-4 py-8">
        <BorrowCard onNewBorrow={handleNewBorrow}>
          {activityCardData.map((data, index) => (
            <ActivityCard key={activities[index].id} data={data} />
          ))}
        </BorrowCard>
      </div>

      {/* Borrow Modal */}
      {selectedActivity && (
        <BorrowModal
          open={modalOpen}
          onClose={handleModalClose}
          collateral={selectedActivity.collateral}
        />
      )}
    </>
  );
}

