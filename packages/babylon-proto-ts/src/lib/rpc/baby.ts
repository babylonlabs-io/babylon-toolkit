import {
  BankExtension,
  DistributionExtension,
  StakingExtension,
} from "@cosmjs/stargate";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
import type { DelegationDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import type {
  DelegationResponse,
  Validator,
} from "cosmjs-types/cosmos/staking/v1beta1/staking";

interface Dependencies {
  bank: BankExtension["bank"];
  staking: StakingExtension["staking"];
  distribution: DistributionExtension["distribution"];
  tmClient: Tendermint34Client;
}

const createBabylonClient = ({
  staking,
  distribution,
  bank,
  tmClient,
}: Dependencies) => ({
  async getDelegations(address: string): Promise<DelegationResponse[]> {
    try {
      const response = await staking.delegatorDelegations(address);
      return response.delegationResponses || [];
    } catch (error) {
      throw new Error(`Failed to fetch delegations for ${address}`, {
        cause: error,
      });
    }
  },

  async getRewards(address: string): Promise<DelegationDelegatorReward[]> {
    try {
      const response = await distribution.delegationTotalRewards(address);
      return response.rewards || [];
    } catch (error) {
      if (error instanceof Error && error.message.includes("no delegation")) {
        return [];
      }
      throw new Error(`Failed to fetch delegation rewards for ${address}`, {
        cause: error,
      });
    }
  },

  async getValidators(): Promise<Validator[]> {
    try {
      const response = await staking.validators("");
      return response.validators || [];
    } catch (error) {
      throw new Error(`Failed to fetch validators`, {
        cause: error,
      });
    }
  },

  async getBalance(address: string, denom: string = "ubbn"): Promise<bigint> {
    try {
      const balance = await bank.balance(address, denom);
      return BigInt(balance?.amount ?? 0);
    } catch (error) {
      throw new Error(`Failed to fetch balance for ${address}`, {
        cause: error,
      });
    }
  },

  async getPool() {
    try {
      const { pool } = await staking.pool();

      return {
        notBondedTokens: Number.parseInt(pool.notBondedTokens, 10),
        bondedTokens: Number.parseInt(pool.bondedTokens, 10),
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch pool`, {
        cause: error,
      });
    }
  },

  async getBlockHeight() {
    try {
      const status = await tmClient.status();
      return status.syncInfo.latestBlockHeight;
    } catch (error) {
      throw new Error(`Failed to fetch block height`, {
        cause: error,
      });
    }
  },
});

export default createBabylonClient;
