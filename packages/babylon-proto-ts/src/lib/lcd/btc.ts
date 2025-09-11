import type { Coin } from "@cosmjs/proto-signing";

import { REWARD_GAUGE_KEY_BTC_DELEGATION } from "../../constants";
import type { RequestFn } from "../utils/http";

interface Dependencies {
  request: RequestFn;
}

const createBTCClient = ({ request }: Dependencies) => ({
  async getRewards(address: string): Promise<number> {
    try {
      const response = await request(
        `/babylon/incentive/address/${address}/reward_gauge`,
      );

      const coins =
        response?.rewardGauges?.[REWARD_GAUGE_KEY_BTC_DELEGATION]?.coins;

      if (!coins) {
        return 0;
      }

      const withdrawnCoins =
        response.rewardGauges[
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

  /**
   * Resolve the base denom for an IBC denom hash using the LCD.
   * Returns the base denom (e.g. "uosmo") or undefined if not found.
   */
  async getIbcDenomBase(hash: string): Promise<string | undefined> {
    const sanitized = encodeURIComponent(hash.replace(/^ibc\//, ""));
    const candidates = [
      `/ibc/apps/transfer/v1/denoms/${sanitized}`,
      `/ibc/apps/transfer/v1/denoms/ibc/${sanitized}`,
    ];
    for (const path of candidates) {
      try {
        const data: any = await request(path);
        const base: string | undefined =
          data?.denom?.base || data?.denomTrace?.base || data?.base;
        if (base) return base;
      } catch {
        // try next candidate
      }
    }
    return undefined;
  },
});

export default createBTCClient;
