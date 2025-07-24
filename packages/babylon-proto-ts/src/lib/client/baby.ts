import type { DistributionExtension, StakingExtension } from "@cosmjs/stargate";
import type { DelegationDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import type { DelegationResponse, Validator } from "cosmjs-types/cosmos/staking/v1beta1/staking";

interface Dependencies {
  staking: StakingExtension["staking"];
  distribution: DistributionExtension["distribution"];
}

const createBabylonClient = ({ staking, distribution }: Dependencies) => ({
  /**
   * Gets all delegations of the user's account.
   * @param {string} address - The address to get the delegations of.
   * @returns {Promise<DelegationResponse[]>} - The delegations of the address.
   */
  async getDelegations(
    address: string,
  ): Promise<DelegationResponse[]> {
    try {
      const response =
        await staking.delegatorDelegations(address);
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
  async getRewards(
    address: string,
  ): Promise<DelegationDelegatorReward[]> {
    try {
      const response =
        await distribution.delegationTotalRewards(address);
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
      const response = await staking.validators("");
      return response.validators || [];
    } catch (error) {
      throw new Error(`Failed to fetch validators`, {
        cause: error,
      });
    }
  }
})

export default createBabylonClient;