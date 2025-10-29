import { REWARD_GAUGE_KEY_BTC_DELEGATION } from "../../constants";
import type { RequestFn } from "../utils/http";
import { sumCoinAmounts } from "../utils/sumCoinAmounts";

interface Dependencies {
  request: RequestFn;
}

const createBTCClient = ({ request }: Dependencies) => ({
  async getRewards(address: string): Promise<bigint> {
    try {
      const response = await request(
        `/babylon/incentive/address/${address}/reward_gauge`,
      );

      const coins =
        response?.rewardGauges?.[REWARD_GAUGE_KEY_BTC_DELEGATION]?.coins;

      if (!coins) {
        return 0n;
      }

      const withdrawnCoins = sumCoinAmounts(
        response.rewardGauges[REWARD_GAUGE_KEY_BTC_DELEGATION]?.withdrawnCoins,
      );

      return sumCoinAmounts(coins) - withdrawnCoins;
    } catch (error) {
      // If error message contains "reward gauge not found", silently return 0
      // This is to handle the case where the user has no rewards, meaning
      // they have not staked
      if (
        error instanceof Error &&
        error.message.includes("reward gauge not found")
      ) {
        return 0n;
      }
      throw new Error(`Failed to fetch rewards for ${address}`, {
        cause: error,
      });
    }
  },

  async getBTCTipHeight(): Promise<number> {
    try {
      const { header } = await request("/babylon/btclightclient/v1/tip");
      return Number(header?.height ?? 0);
    } catch (error) {
      throw new Error(`Failed to fetch BTC tip height`, {
        cause: error,
      });
    }
  },
});

export default createBTCClient;
