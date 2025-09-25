import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import type { CoStakingCurrentRewards } from "@/ui/common/types/api/coStaking";

export const getCurrentCoStakingRewards =
  async (): Promise<CoStakingCurrentRewards> => {
    const { lcdUrl } = getNetworkConfigBBN();
    const url = `${lcdUrl}/babylon/costaking/v1/current_rewards`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch current co-staking rewards: ${response.statusText}`,
        );
      }

      const data: CoStakingCurrentRewards = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching current co-staking rewards:", error);
      throw error;
    }
  };
