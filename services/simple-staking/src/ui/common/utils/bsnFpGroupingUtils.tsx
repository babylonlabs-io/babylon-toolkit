import { FinalityProviderLogo } from "@/ui/common/components/Staking/FinalityProviders/FinalityProviderLogo";
import { FinalityProvider } from "@/ui/common/types/finalityProviders";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { trim } from "@/ui/common/utils/trim";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { ActivityCardDetailItem } from "../components/ActivityCard/ActivityCard";

const { chainId: BBN_CHAIN_ID } = getNetworkConfigBBN();

export interface ExpansionBsnFpOptions {
  /** Original FP keys to compare against for new/old detection */
  originalFinalityProviderBtcPksHex?: string[];
}

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
 * This utility is shared between main activity cards and expansion history
 * Supports expansion-specific features like old/new visual differentiation
 */
export function createBsnFpGroupedDetails(
  finalityProviderBtcPksHex: string[],
  finalityProviderMap: Map<string, FinalityProvider>,
  options: ExpansionBsnFpOptions = {},
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

    const shouldShowFp = FeatureFlagService.IsPhase3Enabled
      ? fp.bsnId // Phase 3: require BSN
      : true; // Phase 2: always show FP

    if (shouldShowFp) {
      const shouldShowBsnItem = FeatureFlagService.IsPhase3Enabled || fp.bsnId;
      const bsnId = fp.bsnId || BBN_CHAIN_ID;

      // Determine if this is a new FP pair (expansion feature)
      const isNew = options.originalFinalityProviderBtcPksHex
        ? !options.originalFinalityProviderBtcPksHex.includes(fpBtcPk)
        : false;

      // Apply opacity based on new/old status for expansions
      const opacityClass =
        options.originalFinalityProviderBtcPksHex && !isNew ? "opacity-60" : "";

      groupedDetails.push({
        items: [
          ...(shouldShowBsnItem
            ? [
                {
                  label: "BSN",
                  value: (
                    <div className={`flex items-center gap-2 ${opacityClass}`}>
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
              <div className={`flex items-center gap-2 ${opacityClass}`}>
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
    }
  });

  return groupedDetails;
}
