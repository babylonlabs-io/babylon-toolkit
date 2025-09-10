import { FinalityProviderLogo } from "@/ui/common/components/Staking/FinalityProviders/FinalityProviderLogo";
import { FinalityProvider } from "@/ui/common/types/finalityProviders";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { ActivityCardDetailItem } from "../components/ActivityCard/ActivityCard";

/**
 * Creates grouped details for BSN/FP pairs from finality provider Bitcoin public keys
 * This utility is shared between main activity cards and expansion history
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

    const shouldShowFp = FeatureFlagService.IsPhase3Enabled
      ? fp.bsnId // Phase 3: require BSN
      : true; // Phase 2: always show FP

    if (shouldShowFp) {
      const shouldShowBsnItem = FeatureFlagService.IsPhase3Enabled || fp.bsnId;

      groupedDetails.push({
        items: [
          ...(shouldShowBsnItem
            ? [
                {
                  label: "BSN",
                  value: (
                    <div className="flex items-center gap-2">
                      <img
                        src={fp.bsnLogoUrl}
                        alt={fp.bsnId}
                        className="h-4 w-4 rounded-full object-cover"
                      />
                      <span>{fp.bsnId}</span>
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
                  rank={fp.rank}
                  moniker={fp.description?.moniker}
                  className="h-4 w-4"
                />
                <span>
                  {fp.description?.moniker ||
                    `Provider ${fp.rank || "Unknown"}`}
                </span>
              </div>
            ),
          },
        ],
      });
    }
  });

  return groupedDetails;
}
