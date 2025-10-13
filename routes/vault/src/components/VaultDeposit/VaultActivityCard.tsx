/**
 * VaultActivityCard - Wrapper component that transforms VaultActivity data
 * into ActivityCard format and handles vault-specific UI logic
 */

import {
  ActivityCard,
  StatusBadge,
  ProviderItem,
  Warning,
  type ActivityCardData,
  type ActivityCardDetailItem,
} from "@babylonlabs-io/core-ui";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { bitcoinIcon } from "../../assets";
import { Hash } from "../Hash";

interface VaultActivityCardProps {
  activity: VaultActivity;
}

export function VaultActivityCard({ activity }: VaultActivityCardProps) {
  // Note: Actions (Borrow/Repay) are now handled in VaultPositions tab
  // This component only displays vault deposit information

  // Build status detail with StatusBadge
  const statusDetail: ActivityCardDetailItem = {
    label: "Status",
    value: (
      <StatusBadge
        status={activity.status.variant as "active" | "inactive" | "pending"}
        label={activity.status.label}
      />
    ),
  };

  // Build providers detail with ProviderItem elements
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

  // Build pegInTxHash detail (for debugging) - with trim and copy functionality
  const txHashDetail: ActivityCardDetailItem | null = activity.txHash ? {
    label: "PegIn Tx Hash",
    value: <Hash value={activity.txHash} symbols={12} />,
  } : null;

  // Build "In Use" detail - shows if vault is being used by an active position
  const inUseDetail: ActivityCardDetailItem | null = activity.isInUse ? {
    label: "Usage Status",
    value: (
      <StatusBadge
        status="active"
        label="In Use"
      />
    ),
  } : null;

  // Build main details array
  const details: ActivityCardDetailItem[] = [
    statusDetail,
    providersDetail,
    ...(inUseDetail ? [inUseDetail] : []),
    ...(txHashDetail ? [txHashDetail] : []),
  ];

  // Transform to ActivityCardData format
  // NOTE: optionalDetails (loan details) are now only shown in VaultPositions tab
  // This card only shows vault deposit/collateral information
  const cardData: ActivityCardData = {
    formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
    icon: activity.collateral.icon || bitcoinIcon,
    iconAlt: activity.collateral.symbol,
    details,
    // Add warning for pending peg-ins
    warning: activity.isPending ? (
      <Warning>
        {activity.pendingMessage ||
          "Your peg-in is being processed. This can take up to ~5 hours while Bitcoin confirmations and provider acknowledgements complete."}
      </Warning>
    ) : undefined,
    // Show action button for Available vaults (Peg Out)
    primaryAction: activity.action ? {
      label: activity.action.label,
      onClick: activity.action.onClick,
    } : undefined,
  };

  return <ActivityCard data={cardData} />;
}
