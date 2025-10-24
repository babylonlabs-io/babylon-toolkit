import type { Coin } from "@cosmjs/stargate";

import {
  REWARD_GAUGE_KEY_BTC_DELEGATION,
  REWARD_GAUGE_KEY_COSTAKER,
} from "../../constants";
import * as btclightclientquery from "../../generated/babylon/btclightclient/v1/query";
import * as incentivequery from "../../generated/babylon/incentive/query";

interface Dependencies {
  incentive: incentivequery.QueryClientImpl;
  btcLight: btclightclientquery.QueryClientImpl;
}

const createBTCClient = ({ incentive, btcLight }: Dependencies) => ({
  /**
   * Gets the total available BTC staking rewards from the user's account.
   * This includes both base BTC staking rewards (BTC_STAKER gauge) and
   * co-staking bonus rewards (COSTAKER gauge).
   * @param address - The Babylon address to query rewards for
   * @returns {Promise<number>} - Total available rewards in ubbn (base BTC + co-staking bonus)
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

      // Calculate rewards from BTC_STAKER gauge (base BTC staking rewards)
      const btcStakerCoins =
        rewards.rewardGauges[REWARD_GAUGE_KEY_BTC_DELEGATION]?.coins;
      const btcStakerWithdrawn =
        rewards.rewardGauges[
          REWARD_GAUGE_KEY_BTC_DELEGATION
        ]?.withdrawnCoins.reduce(
          (acc: number, coin: Coin) => acc + Number(coin.amount),
          0,
        ) || 0;
      const btcStakerTotal = btcStakerCoins
        ? btcStakerCoins.reduce(
            (acc: number, coin: Coin) => acc + Number(coin.amount),
            0,
          )
        : 0;
      const btcStakerAvailable = btcStakerTotal - btcStakerWithdrawn;

      // Calculate rewards from COSTAKER gauge (co-staking bonus)
      const costakerCoins =
        rewards.rewardGauges[REWARD_GAUGE_KEY_COSTAKER]?.coins;
      const costakerWithdrawn =
        rewards.rewardGauges[REWARD_GAUGE_KEY_COSTAKER]?.withdrawnCoins.reduce(
          (acc: number, coin: Coin) => acc + Number(coin.amount),
          0,
        ) || 0;
      const costakerTotal = costakerCoins
        ? costakerCoins.reduce(
            (acc: number, coin: Coin) => acc + Number(coin.amount),
            0,
          )
        : 0;
      const costakerAvailable = costakerTotal - costakerWithdrawn;

      // Total available rewards = BTC staking + co-staking bonus
      return btcStakerAvailable + costakerAvailable;
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
  },
});

export default createBTCClient;
