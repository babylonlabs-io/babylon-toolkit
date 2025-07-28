import type { DelegationDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import type {
  DelegationResponse,
  Validator,
} from "cosmjs-types/cosmos/staking/v1beta1/staking";

import type { RequestFn } from "../utils/http";

interface Dependencies {
  request: RequestFn;
}

const createBabylonClient = ({ request }: Dependencies) => ({
  async getDelegations(address: string): Promise<DelegationResponse[]> {
    try {
      const response = await request(
        `/cosmos/staking/v1beta1/delegations/${address}`,
      );
      return response.delegationResponses || [];
    } catch (error) {
      throw new Error(`Failed to fetch delegations for ${address}`, {
        cause: error,
      });
    }
  },

  /**
   * Gets all delegation rewards of the user's account.
   * @param {string} address - The address to get the delegation rewards of.
   * @returns {Promise<DelegationDelegatorReward[]>} - The delegation rewards of the address.
   */
  async getRewards(address: string): Promise<DelegationDelegatorReward[]> {
    try {
      const response = await request(
        `/cosmos/distribution/v1beta1/delegators/${address}/rewards`,
      );
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

  /**
   * Gets all the validators.
   * @returns {Promise<Validator[]>} - All validators.
   */
  async getValidators(): Promise<Validator[]> {
    try {
      const response = await request("/cosmos/staking/v1beta1/validators");
      return response.validators || [];
    } catch (error) {
      throw new Error(`Failed to fetch validators`, {
        cause: error,
      });
    }
  },

  /**
   * Gets the balance of an address in the Babylon chain.
   * @param {string} address - The address to get the balance of.
   * @param {string} denom - The denom of the balance to get.
   * @returns {Promise<number>} - The balance of the address.
   */
  async getBalance(address: string, denom: string = "ubbn"): Promise<bigint> {
    try {
      const response = await request(
        `/cosmos/bank/v1beta1/balances/${address}/by_denom`,
        { denom },
      );
      return BigInt(response?.balance?.amount ?? 0);
    } catch (error) {
      throw new Error(`Failed to fetch balance for ${address}`, {
        cause: error,
      });
    }
  },
});

export default createBabylonClient;
