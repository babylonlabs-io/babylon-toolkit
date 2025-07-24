import type{ BankExtension, Coin } from "@cosmjs/stargate";

import { REWARD_GAUGE_KEY_BTC_DELEGATION } from "../../constants";
import * as btclightclientquery from "../../generated/babylon/btclightclient/v1/query";
import * as incentivequery from "../../generated/babylon/incentive/query";

interface Dependencies {
  incentive: incentivequery.QueryClientImpl;
  btcLight: btclightclientquery.QueryClientImpl;
}

const createBTCClient = ({ incentive, btcLight }: Dependencies) => ({
/**
   * Gets the rewards of the user's account.
   * @param {string} address - The address to get the rewards of.
   * @returns {Promise<number>} - The rewards of the address.
   */
  async getRewards(address: string): Promise<number> {
    try {
      const req = incentivequery.QueryRewardGaugesRequest.fromPartial({
        address,
      });

      const rewards = await incentive.RewardGauges(req);
      if (!rewards || !rewards.rewardGauges) {
        return 0;
      }

      const coins =
        rewards.rewardGauges[REWARD_GAUGE_KEY_BTC_DELEGATION]?.coins;
      if (!coins) {
        return 0;
      }

      const withdrawnCoins =
        rewards.rewardGauges[
          REWARD_GAUGE_KEY_BTC_DELEGATION
        ]?.withdrawnCoins.reduce(
          (acc: number, coin: Coin) => acc + Number(coin.amount),
          0,
        ) || 0;

      return (
        coins.reduce(
          (acc: number, coin: Coin) => acc + Number(coin.amount),
          0,
        ) - withdrawnCoins
      );
    } catch (error) {
      // If error message contains "reward gauge not found", silently return 0
      // This is to handle the case where the user has no rewards, meaning
      // they have not staked
      if (
        error instanceof Error &&
        error.message.includes("reward gauge not found")
      ) {
        return 0;
      }
      throw new Error(`Failed to fetch rewards for ${address}`, {
        cause: error,
      });
    }
  },

  /**
   * Gets the tip of the Bitcoin blockchain.
   * @returns {Promise<BTCHeaderInfoResponse>} - The tip of the Bitcoin blockchain.
   */
  async getBTCTipHeight(): Promise<number> {
    try {
      const req = btclightclientquery.QueryTipRequest.fromPartial({});
      const { header } = await btcLight.Tip(req);
      return Number(header?.height ?? 0);
    } catch (error) {
      throw new Error(`Failed to fetch BTC tip height`, {
        cause: error,
      });
    }
  }
})

export default createBTCClient;