import {
  REWARD_GAUGE_KEY_BTC_DELEGATION,
  REWARD_GAUGE_KEY_COSTAKER,
} from "../../constants";
import type { BTCRewards } from "../rpc/btc";
import type { RequestFn } from "../utils/http";
import { sumCoinAmounts } from "../utils/sumCoinAmounts";

interface Dependencies {
  request: RequestFn;
}

const createBTCClient = ({ request }: Dependencies) => ({
  async getRewards(address: string): Promise<BTCRewards> {
    try {
      const response = await request(
        `/babylon/incentive/address/${address}/reward_gauge`,
      );

      if (!response?.rewardGauges) {
        return {
          btcStaker: 0n,
          coStaker: 0n,
        };
      }

      // Calculate rewards from BTC_STAKER gauge (base BTC staking rewards)
      const btcStakerCoins =
        response.rewardGauges[REWARD_GAUGE_KEY_BTC_DELEGATION]?.coins;
      const btcStakerWithdrawn = sumCoinAmounts(
        response.rewardGauges[REWARD_GAUGE_KEY_BTC_DELEGATION]?.withdrawnCoins,
      );
      const btcStakerTotal = sumCoinAmounts(btcStakerCoins);
      const btcStakerAvailable = btcStakerTotal - btcStakerWithdrawn;

      // Calculate rewards from COSTAKER gauge (co-staking bonus)
      const costakerCoins =
        response.rewardGauges[REWARD_GAUGE_KEY_COSTAKER]?.coins;
      const costakerWithdrawn = sumCoinAmounts(
        response.rewardGauges[REWARD_GAUGE_KEY_COSTAKER]?.withdrawnCoins,
      );
      const costakerTotal = sumCoinAmounts(costakerCoins);
      const costakerAvailable = costakerTotal - costakerWithdrawn;

      // Return separated values for accurate display
      return {
        btcStaker: btcStakerAvailable,
        coStaker: costakerAvailable,
      };
    } catch (error) {
      // If error message contains "reward gauge not found", silently return 0
      // This is to handle the case where the user has no rewards, meaning
      // they have not staked
      if (
        error instanceof Error &&
        error.message.includes("reward gauge not found")
      ) {
        return {
          btcStaker: 0n,
          coStaker: 0n,
        };
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
