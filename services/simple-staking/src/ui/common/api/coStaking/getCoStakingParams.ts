import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import type { CoStakingParamsResponse } from "@/ui/common/types/api/coStaking";

export const getCoStakingParams =
  async (): Promise<CoStakingParamsResponse> => {
    const { lcdUrl } = getNetworkConfigBBN();
    const url = `${lcdUrl}/babylon/costaking/v1/params`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch co-staking params: ${response.statusText}`,
        );
      }

      const data: CoStakingParamsResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching co-staking params:", error);
      throw error;
    }
  };
