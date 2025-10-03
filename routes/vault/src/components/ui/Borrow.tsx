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

export function Borrow() {
  const [activities] = useState<VaultActivity[]>(mockVaultActivities);

  const handleNewBorrow = () => {
    console.log("New borrow clicked");
    // TODO: Open modal to create new borrow
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
        onClick: activity.action.onClick,
      },
    };
  });

  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col px-4 py-8">
      <BorrowCard onNewBorrow={handleNewBorrow}>
        {activityCardData.map((data, index) => (
          <ActivityCard key={activities[index].id} data={data} />
        ))}
      </BorrowCard>
    </div>
  );
}

