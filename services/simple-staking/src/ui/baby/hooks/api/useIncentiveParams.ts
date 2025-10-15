import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

const INCENTIVE_PARAMS_KEY = "INCENTIVE_PARAMS_KEY";

export interface IncentiveParamsResult {
  btcStakingPortion: number | null;
  fpPortion: number | null;
  validatorsPortion: number | null;
  costakingPortion: number | null;
}

export function useIncentiveParams({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const isCoStakingEnabled = FeatureFlagService.IsCoStakingEnabled;

  return useClientQuery<IncentiveParamsResult>({
    queryKey: [INCENTIVE_PARAMS_KEY, isCoStakingEnabled],
    queryFn: async () => {
      const client = await babylon.client();
      let incentive, costaking;

      try {
        incentive = await client.baby.getIncentiveParams();
      } catch {
        incentive = null;
      }

      // Only fetch co-staking params if feature flag is enabled
      if (isCoStakingEnabled) {
        try {
          costaking = await client.baby.getCostakingParams();
        } catch {
          costaking = null;
        }
      } else {
        costaking = null;
      }

      return {
        btcStakingPortion: incentive
          ? Number(incentive.btcStakingPortion ?? 0)
          : null,
        fpPortion: incentive ? Number(incentive.fpPortion ?? 0) : null,
        validatorsPortion: costaking
          ? Number(costaking.validatorsPortion ?? 0)
          : null,
        costakingPortion: costaking
          ? Number(costaking.costakingPortion ?? 0)
          : null,
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
