import { getPersonalizedAPR } from "@/ui/common/api/getAPR";
import { ONE_MINUTE } from "@/ui/common/constants";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";

const GLOBAL_APR_KEY = "GLOBAL_APR";

export interface GlobalAPRData {
  btcStakingApr: number;
  maxStakingApr: number;
}

/**
 * Hook to fetch global APR data
 * Returns base BTC staking APR and maximum staking APR (with co-staking)
 */
export function useGlobalAPR({ enabled = true }: { enabled?: boolean } = {}) {
  return useClientQuery({
    queryKey: [GLOBAL_APR_KEY],
    queryFn: async (): Promise<GlobalAPRData> => {
      const result = await getPersonalizedAPR(0, 0);
      return {
        btcStakingApr: result.btc_staking_apr,
        maxStakingApr: result.max_staking_apr,
      };
    },
    refetchInterval: ONE_MINUTE,
    enabled,
    retry: 3,
  });
}
