import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import type { CoStakerRewardsTracker } from "@/ui/common/types/api/coStaking";

export const getCoStakerRewardsTracker = async (
  costaker_address: string,
): Promise<CoStakerRewardsTracker | null> => {
  if (!costaker_address) {
    return null;
  }

  const { lcdUrl } = getNetworkConfigBBN();
  const url = `${lcdUrl}/babylon/costaking/v1/costakers/${costaker_address}/rewards_tracker`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        // User has not co-staked yet?
        return null;
      }
      throw new Error(
        `Failed to fetch co-staker rewards tracker: ${response.statusText}`,
      );
    }

    const data: CoStakerRewardsTracker = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching co-staker rewards tracker:", error);
    throw error;
  }
};
