import {
  BankExtension,
  Coin,
  QueryClient,
  createProtobufRpcClient,
  setupBankExtension,
} from "@cosmjs/stargate";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";

import { REWARD_GAUGE_KEY_BTC_DELEGATION } from "../constants";
import * as btclightclientquery from "../generated/babylon/btclightclient/v1/query";
import * as incentivequery from "../generated/babylon/incentive/query";

interface Clients {
  incentive: incentivequery.QueryClientImpl;
  btcLight: btclightclientquery.QueryClientImpl;
  bank: BankExtension["bank"];
}

type ClientNames = keyof Clients;

export class BabylonClient {
  private rpcUrl: string;

  private clients: Clients = {
    incentive: null,
    btcLight: null,
    bank: null,
  };

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  private getClient<K extends ClientNames>(clientName: K): Clients[K] {
    if (!this.clients[clientName]) {
      throw Error("Babylon Client not initialized");
    }

    return this.clients[clientName];
  }

  async connect(): Promise<void> {
    const tmClient = await Tendermint34Client.connect(this.rpcUrl);
    const queryClient = QueryClient.withExtensions(
      tmClient,
      setupBankExtension,
    );
    const rpc = createProtobufRpcClient(queryClient);

    this.clients.incentive = new incentivequery.QueryClientImpl(rpc);
    this.clients.btcLight = new btclightclientquery.QueryClientImpl(rpc);
    this.clients.bank = setupBankExtension(queryClient).bank;
  }

  /**
   * Gets the rewards of an address in the Babylon chain.
   * @param {string} address - The address to get the rewards of.
   * @returns {Promise<number>} - The rewards of the address.
   */
  async getRewards(address: string): Promise<number> {
    try {
      const req = incentivequery.QueryRewardGaugesRequest.fromPartial({
        address,
      });

      const rewards = await this.getClient("incentive").RewardGauges(req);
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
  }

  /**
   * Gets the balance of an address in the Babylon chain.
   * @param {string} address - The address to get the balance of.
   * @param {string} denom - The denom of the balance to get.
   * @returns {Promise<number>} - The balance of the address.
   */
  async getBalance(address: string, denom: string = "ubbn"): Promise<number> {
    try {
      const balance = await this.getClient("bank").balance(address, denom);
      return Number(balance?.amount ?? 0);
    } catch (error) {
      throw new Error(`Failed to fetch balance for ${address}`, {
        cause: error,
      });
    }
  }

  /**
   * Gets the tip of the Bitcoin blockchain.
   * @returns {Promise<BTCHeaderInfoResponse>} - The tip of the Bitcoin blockchain.
   */
  async getBTCTipHeight(): Promise<number> {
    try {
      const req = btclightclientquery.QueryTipRequest.fromPartial({});
      const { header } = await this.getClient("btcLight").Tip(req);
      return Number(header?.height ?? 0);
    } catch (error) {
      throw new Error(`Failed to fetch BTC tip height`, {
        cause: error,
      });
    }
  }
}

export const createBabylonClient = (rpcUrl: string) =>
  new BabylonClient(rpcUrl);
