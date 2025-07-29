import type {
  BankExtension,
  DistributionExtension,
  StakingExtension,
} from "@cosmjs/stargate";
import type { DelegationDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import type {
  DelegationResponse,
  Validator,
} from "cosmjs-types/cosmos/staking/v1beta1/staking";

interface Dependencies {
  bank: BankExtension["bank"];
  staking: StakingExtension["staking"];
  distribution: DistributionExtension["distribution"];
}

const createBabylonClient = ({
  staking,
  distribution,
  bank,
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
        notBondedTokens: parseInt(pool.notBondedTokens, 10),
        bondedTokens: parseInt(pool.bondedTokens, 10),
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch pool`, {
        cause: error,
      });
    }
  },
});

export default createBabylonClient;
