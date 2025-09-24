import { Status } from "@/ui/common/components/Delegations/DelegationList/components/Status";
import { Hash } from "@/ui/common/components/Hash/Hash";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { EXPANSION_OPERATIONS } from "@/ui/common/constants";
import {
  DelegationV2,
  DelegationV2StakingState,
  DelegationWithFP,
} from "@/ui/common/types/delegationsV2";
import { FinalityProvider } from "@/ui/common/types/finalityProviders";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";
import { getExpansionType } from "@/ui/common/utils/stakingExpansionUtils";
import { durationTillNow, MINUTES_PER_BLOCK } from "@/ui/common/utils/time";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { createBsnFpGroupedDetails } from "../../../utils/bsnFpGroupingUtils";
import { ActivityCardData, ActivityCardDetailItem } from "../ActivityCard";

const { coinName, icon } = getNetworkConfigBTC();

export interface ActivityCardTransformOptions {
  showExpansionSection?: boolean;
  hideExpansionCompletely?: boolean;
  isBroadcastedExpansion?: boolean;
}

/**
 * Transforms a delegation into ActivityCard data
 * Used by both main activity list and expansion history
 */
export function transformDelegationToActivityCard(
  delegation: DelegationV2 | DelegationWithFP,
  finalityProviderMap: Map<string, FinalityProvider>,
  options: ActivityCardTransformOptions = {},
  indexLabel?: string,
  currentBtcHeight?: number | { height: number; [key: string]: any },
): ActivityCardData {
  // Create a delegation with FP for the Status component if not already present
  let delegationWithFP =
    "fp" in delegation
      ? delegation
      : ({
          ...delegation,
          fp:
            Array.isArray(delegation.finalityProviderBtcPksHex) &&
            delegation.finalityProviderBtcPksHex.length > 0
              ? // Use the first FP [0] for backward compatibility with Status component
                // which expects a single FP. The full BSN/FP pairs are handled separately
                // in groupedDetails for comprehensive display
                finalityProviderMap.get(delegation.finalityProviderBtcPksHex[0])
              : undefined,
        } as DelegationWithFP);

  // Transform the state for broadcasted expansions to show correct status
  if (options.isBroadcastedExpansion) {
    delegationWithFP = {
      ...delegationWithFP,
      state: DelegationV2StakingState.INTERMEDIATE_PENDING_BTC_CONFIRMATION,
    };
  }

  const isTimelockRenewalEnabled = FeatureFlagService.IsTimelockRenewalEnabled;

  const details: ActivityCardDetailItem[] = [
    {
      label: "Status",
      value: <Status delegation={delegationWithFP} showTooltip={true} />,
    },
    ...(!isTimelockRenewalEnabled
      ? [
          {
            label: "Inception",
            value: delegation.bbnInceptionTime
              ? durationTillNow(delegation.bbnInceptionTime, Date.now(), false)
              : "N/A",
          },
        ]
      : []),
    ...(isTimelockRenewalEnabled
      ? [
          {
            label: "Finality Provider",
            value: (() => {
              const fp = finalityProviderMap.get(
                delegation.finalityProviderBtcPksHex[0],
              );
              return fp?.description?.moniker || "Unknown Provider";
            })(),
          },
          {
            label: "Staking Term End Date",
            value: (() => {
              const formatStakingEndDate = (
                delegation: DelegationV2 | DelegationWithFP,
              ): string => {
                if (
                  delegation.endHeight &&
                  typeof delegation.endHeight === "number" &&
                  delegation.endHeight > 0
                ) {
                  const currentHeight =
                    typeof currentBtcHeight === "object" &&
                    currentBtcHeight?.height
                      ? currentBtcHeight.height
                      : typeof currentBtcHeight === "number"
                        ? currentBtcHeight
                        : 0;

                  // If no current height available yet, show loading state
                  if (currentHeight === 0) {
                    return "Loading...";
                  }
                  const blocksRemaining = Math.max(
                    0,
                    delegation.endHeight - currentHeight,
                  );

                  // If timelock is in the past, show expired
                  if (blocksRemaining === 0) {
                    return "Expired";
                  }

                  const millisecondsRemaining =
                    blocksRemaining * MINUTES_PER_BLOCK * 60 * 1000;
                  const endDate = new Date(Date.now() + millisecondsRemaining);

                  // Validate the resulting date
                  if (isNaN(endDate.getTime())) {
                    return "Invalid date";
                  }

                  return endDate.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  });
                }

                return "Unknown";
              };
              return formatStakingEndDate(delegation);
            })(),
          },
        ]
      : []),
    {
      label: "Tx Hash",
      value: <Hash value={delegation.stakingTxHashHex} address small noFade />,
    },
  ];

  // Create grouped details for BSN/FP pairs - only disabled when feature flag is enabled
  const groupedDetails = !isTimelockRenewalEnabled
    ? createBsnFpGroupedDetails(
        delegation.finalityProviderBtcPksHex,
        finalityProviderMap,
      )
    : [];

  // Handle expansion section if options specify it
  // let expansionSection: DelegationWithFP | undefined;
  // let isPendingExpansion = false;

  if (options.showExpansionSection) {
    // Check if expansion section should be shown
    // 1. Delegation is active and can expand from the api
    // 2. OR delegation is a broadcasted VERIFIED expansion (waiting for confirmations)
    const isActiveExpandable =
      delegation.state === DelegationV2StakingState.ACTIVE &&
      delegation.canExpand;

    const showExpansionSection =
      isActiveExpandable || options.isBroadcastedExpansion;

    if (showExpansionSection) {
      // expansionSection = delegationWithFP;
      // const isPendingExpansion = !!options.isBroadcastedExpansion;
    }
  }

  const baseAmount = `${maxDecimals(satoshiToBtc(delegation.stakingAmount), 8)} ${coinName}`;
  const formattedAmount = indexLabel
    ? `${indexLabel} - ${baseAmount}`
    : baseAmount;

  // Determine if we should show the expansion pending banner
  // const showExpansionPendingBanner = !!options.isBroadcastedExpansion;

  return {
    formattedAmount,
    icon: icon,
    iconAlt: "bitcoin",
    details,
    groupedDetails: groupedDetails.length > 0 ? groupedDetails : undefined,
    // expansionSection,
    // isPendingExpansion,
    // showExpansionPendingBanner,
    // hideExpansionCompletely: options.hideExpansionCompletely,
  };
}

/**
 * Transforms a delegation into ActivityCard data specifically for verified expansions
 * Shows "Verified" status and includes expansion type information
 */
export function transformDelegationToVerifiedExpansionCard(
  delegation: DelegationV2,
  originalDelegation: DelegationV2,
  finalityProviderMap: Map<string, FinalityProvider>,
  currentBtcHeight?: number | { height: number; [key: string]: any },
): ActivityCardData {
  // Determine expansion type
  const operationType = getExpansionType(delegation, originalDelegation);

  const isTimelockRenewalEnabled = FeatureFlagService.IsTimelockRenewalEnabled;

  const details: ActivityCardDetailItem[] = [
    {
      label: "Status",
      value: "Verified",
    },
    ...(!isTimelockRenewalEnabled
      ? [
          {
            label: "Inception",
            value: delegation.bbnInceptionTime
              ? durationTillNow(delegation.bbnInceptionTime, Date.now(), false)
              : "N/A",
          },
        ]
      : []),
    ...(isTimelockRenewalEnabled
      ? [
          {
            label: "Finality Provider",
            value: (() => {
              const fp = finalityProviderMap.get(
                delegation.finalityProviderBtcPksHex[0],
              );
              return fp?.description?.moniker || "Unknown Provider";
            })(),
          },
          {
            label: "Staking Term End Date",
            value: (() => {
              const formatStakingEndDate = (
                delegation: DelegationV2 | DelegationWithFP,
              ): string => {
                if (
                  delegation.endHeight &&
                  typeof delegation.endHeight === "number" &&
                  delegation.endHeight > 0
                ) {
                  const currentHeight =
                    typeof currentBtcHeight === "object" &&
                    currentBtcHeight?.height
                      ? currentBtcHeight.height
                      : typeof currentBtcHeight === "number"
                        ? currentBtcHeight
                        : 0;

                  if (currentHeight === 0) {
                    return "Loading...";
                  }

                  const blocksRemaining = Math.max(
                    0,
                    delegation.endHeight - currentHeight,
                  );

                  // If timelock is in the past, show expired
                  if (blocksRemaining === 0) {
                    return "Expired";
                  }

                  const millisecondsRemaining =
                    blocksRemaining * MINUTES_PER_BLOCK * 60 * 1000;
                  const endDate = new Date(Date.now() + millisecondsRemaining);

                  if (isNaN(endDate.getTime())) {
                    return "Invalid date";
                  }

                  return endDate.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  });
                }

                return "Unknown";
              };
              return formatStakingEndDate(delegation);
            })(),
          },
        ]
      : []),
    {
      label: "Tx Hash",
      value: <Hash value={delegation.stakingTxHashHex} address small noFade />,
    },
    {
      label: "Expansion Type",
      value:
        operationType === EXPANSION_OPERATIONS.RENEW_TIMELOCK
          ? "Timelock Renewal"
          : "Added BSN/FP",
    },
  ];

  const formattedAmount = `${maxDecimals(satoshiToBtc(delegation.stakingAmount), 8)} ${coinName}`;

  // Create grouped details for BSN/FP pairs with expansion support - only when feature flag is disabled
  const groupedDetails = !isTimelockRenewalEnabled
    ? createBsnFpGroupedDetails(
        delegation.finalityProviderBtcPksHex,
        finalityProviderMap,
        {
          originalFinalityProviderBtcPksHex:
            originalDelegation.finalityProviderBtcPksHex,
        },
      )
    : [];

  return {
    formattedAmount,
    icon: icon,
    iconAlt: "bitcoin",
    details,
    groupedDetails: groupedDetails.length > 0 ? groupedDetails : undefined,
    // hideExpansionCompletely: true, // Hide expansion section in verified modal
  };
}
