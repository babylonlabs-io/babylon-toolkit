import type {
  DelegationDelegatorReward
} from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import type {
  DelegationResponse,
  Validator,
} from "cosmjs-types/cosmos/staking/v1beta1/staking";

import type { RequestFn } from "../utils/http";
import { fetchAllPages } from "../utils/pagination";

interface Dependencies {
  request: RequestFn;
}

const createBabylonClient = ({ request }: Dependencies) => ({
  async getDelegations(address: string): Promise<DelegationResponse[]> {
    try {
      return await fetchAllPages(
        request,
        `/cosmos/staking/v1beta1/delegations/${address}`,
        "delegationResponses"
      );
    } catch (error) {
      throw new Error(`Failed to fetch delegations for ${address}`, {
        cause: error,
      });
    }
  },

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

  async getValidators(): Promise<Validator[]> {
    try {
      return await fetchAllPages(request, "/cosmos/staking/v1beta1/validators", "validators");
    } catch (error) {
      throw new Error(`Failed to fetch validators`, {
        cause: error,
      });
    }
  },

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

  async getPool() {
    try {
      const { pool } = await request("/cosmos/staking/v1beta1/pool");

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

  async getInflation(): Promise<number> {
    try {
      const { inflation } = await request(
        "/cosmos/mint/v1beta1/inflation",
      );
      return Number(inflation);
    } catch {
      return 0;
    }
  },

  async getSupply(denom: string = "ubbn"): Promise<bigint> {
    try {
      const response = await request(
        "/cosmos/bank/v1beta1/supply/by_denom",
        { denom },
      );
      const amount = response?.amount?.amount ?? 0;
      return BigInt(amount);
    } catch (error: any) {
      throw new Error(`Failed to fetch supply for ${denom}`, {
        cause: error,
      });
    }
  },

  async getCurrentEpoch() {
    try {
      const {
        current_epoch, epoch_boundary
      } = await request("/babylon/epoching/v1/current_epoch");

      return {
        epochBoundary: parseInt(epoch_boundary, 10),
        currentEpoch: parseInt(current_epoch, 10),
      };
    } catch (error: unknown) {
      throw new Error(`Failed to fetch current epoch`, {
        cause: error,
      });
    }
  },

  async getSigningInfos(): Promise<{ address: string; tombstoned: boolean }[]> {
    try {
      const infos = await fetchAllPages<any>(
        request,
        "/cosmos/slashing/v1beta1/signing_infos",
        "info",
        { limit: 200 },
      );
      return infos.map((i: any) => ({
        address: i.address,
        tombstoned: Boolean(i.tombstoned),
      }));
    } catch (error: unknown) {
      throw new Error("Failed to fetch signing infos", { cause: error });
    }
  },

  async getLatestValidatorSet(): Promise<
    { address: string; pubKey?: { key?: string } }[]
  > {
    try {
      const validators = await fetchAllPages<any>(
        request,
        "/cosmos/base/tendermint/v1beta1/validatorsets/latest",
        "validators",
        { limit: 200 },
      );
      return validators as { address: string; pubKey?: { key?: string } }[];
    } catch (error: unknown) {
      throw new Error("Failed to fetch latest validator set", { cause: error });
    }
  },
});

export default createBabylonClient;
