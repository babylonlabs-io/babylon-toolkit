import { Status } from "@/ui/common/components/Delegations/DelegationList/components/Status";
import { Hash } from "@/ui/common/components/Hash/Hash";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import {
  DelegationV2,
  DelegationWithFP,
} from "@/ui/common/types/delegationsV2";
import { FinalityProvider } from "@/ui/common/types/finalityProviders";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";
import { blocksToDisplayTime, durationTillNow } from "@/ui/common/utils/time";
import { trim } from "@/ui/common/utils/trim";

import { createBsnFpGroupedDetails } from "../../../utils/bsnFpGroupingUtils";
import { ActivityCardData, ActivityCardDetailItem } from "../ActivityCard";

const { coinName, icon, mempoolApiUrl } = getNetworkConfigBTC();

export interface ActivityCardTransformOptions {
  unbondingTime?: number;
}

/**
 * Transforms a delegation into ActivityCard data
 */
export function transformDelegationToActivityCard(
  delegation: DelegationV2 | DelegationWithFP,
  finalityProviderMap: Map<string, FinalityProvider>,
  options: ActivityCardTransformOptions = {},
  indexLabel?: string,
): ActivityCardData {
  // Create a delegation with FP for the Status component if not already present
  const delegationWithFP =
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

  const details: ActivityCardDetailItem[] = [
    {
      label: "Status",
      value: <Status delegation={delegationWithFP} showTooltip={true} />,
    },
    {
      label: "Inception",
      value: delegation.bbnInceptionTime
        ? durationTillNow(delegation.bbnInceptionTime, Date.now(), false)
        : "N/A",
    },
    {
      label: "Tx Hash",
      value: (
        <Hash
          value={delegation.stakingTxHashHex}
          address
          small
          noFade
          size="caption"
        />
      ),
    },
  ];

  if (delegation.withdrawalTx?.txHash) {
    details.push({
      label: "Withdrawal Tx",
      value: (
        <a
          href={`${mempoolApiUrl}/tx/${delegation.withdrawalTx.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent-primary hover:underline"
        >
          {trim(delegation.withdrawalTx.txHash, 8)}
        </a>
      ),
    });
  }

  // Create grouped details for BSN/FP pairs using shared utility
  const groupedDetails = createBsnFpGroupedDetails(
    delegation.finalityProviderBtcPksHex,
    finalityProviderMap,
  );

  const baseAmount = `${maxDecimals(satoshiToBtc(delegation.stakingAmount), 8)} ${coinName}`;
  const formattedAmount = indexLabel
    ? `${indexLabel} - ${baseAmount}`
    : baseAmount;

  const unbondingDetail = options.unbondingTime
    ? {
        label: "Unbonding Period",
        value: `${blocksToDisplayTime(options.unbondingTime)}`,
      }
    : undefined;

  return {
    formattedAmount,
    icon: icon,
    iconAlt: "bitcoin",
    details,
    groupedDetails: groupedDetails.length > 0 ? groupedDetails : undefined,
    optionalDetails: unbondingDetail ? [unbondingDetail] : [],
  };
}
