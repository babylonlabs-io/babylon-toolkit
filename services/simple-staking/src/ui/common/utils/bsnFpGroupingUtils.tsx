import { FinalityProviderLogo } from "@/ui/common/components/Staking/FinalityProviders/FinalityProviderLogo";
import { FinalityProvider } from "@/ui/common/types/finalityProviders";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { trim } from "@/ui/common/utils/trim";

import { ActivityCardDetailItem } from "../components/ActivityCard/ActivityCard";

const { chainId: BBN_CHAIN_ID } = getNetworkConfigBBN();

/**
 * Helper function to get display name for a finality provider
 */
function getFinalityProviderDisplayName(
  fp: FinalityProvider | undefined,
  fpBtcPk: string,
): string {
  // If we have a finality provider with a moniker, use it
  if (fp?.description?.moniker) {
    return fp.description.moniker;
  }

  // If we have a finality provider without moniker, use rank
  if (fp) {
    return `Provider ${fp.rank || 0}`;
  }

  // Fallback to truncated public key
  return trim(fpBtcPk, 8);
}

/**
 * Creates grouped details for BSN/FP pairs from finality provider Bitcoin public keys
 * Used by activity cards to display BSN and finality provider information
 */
export function createBsnFpGroupedDetails(
  finalityProviderBtcPksHex: string[],
  finalityProviderMap: Map<string, FinalityProvider>,
): { label?: string; items: ActivityCardDetailItem[] }[] {
  const groupedDetails: { label?: string; items: ActivityCardDetailItem[] }[] =
    [];

  if (!finalityProviderBtcPksHex || finalityProviderBtcPksHex.length === 0) {
    return groupedDetails;
  }

  finalityProviderBtcPksHex.forEach((fpBtcPk) => {
    const fp = finalityProviderMap.get(fpBtcPk);

    if (!fp) {
      return;
    }

    const shouldShowBsnItem = !!fp.bsnId;
    const bsnId = fp.bsnId || BBN_CHAIN_ID;

    groupedDetails.push({
      items: [
        ...(shouldShowBsnItem
          ? [
              {
                label: "BSN",
                value: (
                  <div className="flex items-center gap-2">
                    <img
                      src={fp.bsnLogoUrl || ""}
                      alt={bsnId}
                      className="h-4 w-4 rounded-full object-cover"
                    />
                    <span>{bsnId}</span>
                  </div>
                ),
              },
            ]
          : []),
        {
          label: "Finality Provider",
          value: (
            <div className="flex items-center gap-2">
              <FinalityProviderLogo
                logoUrl={fp.logo_url}
                rank={fp.rank || 0}
                moniker={fp.description?.moniker}
                className="h-4 w-4"
              />
              <span>{getFinalityProviderDisplayName(fp, fpBtcPk)}</span>
            </div>
          ),
        },
      ],
    });
  });

  return groupedDetails;
}
