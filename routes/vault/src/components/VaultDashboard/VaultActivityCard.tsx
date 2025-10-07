/**
 * VaultActivityCard - Wrapper component that transforms VaultActivity data
 * into ActivityCard format and handles vault-specific UI logic
 */

import {
  ActivityCard,
  StatusBadge,
  ProviderItem,
  type ActivityCardData,
  type ActivityCardDetailItem,
} from "@babylonlabs-io/core-ui";
import type { VaultActivity } from "../../mockData/vaultActivities";
import { getVaultState, getActionForState } from "../../utils/vaultState";
import { formatUSDCAmount } from "../../utils/peginTransformers";

interface VaultActivityCardProps {
  activity: VaultActivity;
  onBorrow: (activity: VaultActivity) => void;
  onRepay: (activity: VaultActivity) => void;
}

export function VaultActivityCard({ activity, onBorrow, onRepay }: VaultActivityCardProps) {
  // Get vault state for action determination
  const vaultState = getVaultState(activity);

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

  // Build main details array
  const details: ActivityCardDetailItem[] = [statusDetail, providersDetail];

  // Build optional loan details if borrowing data exists
  const optionalDetails: ActivityCardDetailItem[] = [];

  if (activity.borrowingData && activity.morphoPosition) {
    // Loan details section header
    optionalDetails.push({
      label: (
        <div className="space-y-1">
          <div className="text-base font-semibold text-accent-primary">Loan Details</div>
          <div className="text-xs text-accent-secondary">Your current loan</div>
        </div>
      ),
      value: "",
    });

    // Original borrowed amount (from borrowingData.borrowedAmount)
    optionalDetails.push({
      label: "Borrowed",
      value: `${activity.borrowingData.borrowedAmount} ${activity.borrowingData.borrowedSymbol}`,
    });

    // Total amount to repay (borrowAssets - includes principal + interest)
    const borrowAssets = activity.morphoPosition.borrowAssets;
    const totalRepayAmount = formatUSDCAmount(borrowAssets);

    // Calculate interest accrued
    const borrowedAmountRaw = BigInt(Math.round(parseFloat(activity.borrowingData.borrowedAmount) * 1_000_000));
    const interestAccrued = formatUSDCAmount(borrowAssets - borrowedAmountRaw);

    optionalDetails.push({
      label: "Total to Repay",
      value: `${totalRepayAmount} ${activity.borrowingData.borrowedSymbol}`,
    });

    // Interest accrued
    if (parseFloat(interestAccrued) > 0) {
      optionalDetails.push({
        label: "Interest Accrued",
        value: `${interestAccrued} ${activity.borrowingData.borrowedSymbol}`,
      });
    }

    // Current LTV (only if calculated)
    if (activity.borrowingData.currentLTV > 0) {
      optionalDetails.push({
        label: "LTV",
        value: `${activity.borrowingData.currentLTV}%`,
      });
    }

    // Liquidation LTV
    optionalDetails.push({
      label: "Liquidation LTV",
      value: `${activity.borrowingData.maxLTV}%`,
    });
  }

  // Transform to ActivityCardData format
  const cardData: ActivityCardData = {
    formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
    icon: activity.collateral.icon,
    iconAlt: activity.collateral.symbol,
    details,
    optionalDetails: optionalDetails.length > 0 ? optionalDetails : undefined,
    primaryAction: getActionForState(vaultState, activity, onBorrow, onRepay),
  };

  return <ActivityCard data={cardData} />;
}
