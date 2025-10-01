import type { DelegationDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
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
        "delegationResponses",
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
      return await fetchAllPages(
        request,
        "/cosmos/staking/v1beta1/validators",
        "validators",
      );
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

  async getIncentiveParams(): Promise<{
    btcStakingPortion: number;
    fpPortion: number;
  }> {
    const response = await request("/babylon/incentive/params");
    const params = response?.params ?? response;
    const btcStakingPortion = Number(params?.btcStakingPortion ?? 0);
    const fpPortion = Number(params?.fpPortion ?? 0);
    return {
      btcStakingPortion: Number.isFinite(btcStakingPortion)
        ? btcStakingPortion
        : 0,
      fpPortion: Number.isFinite(fpPortion) ? fpPortion : 0,
    };
  },

  async getCostakingParams(): Promise<{
    costakingPortion: number;
    validatorsPortion: number;
    scoreRatioBtcByBaby: string;
  }> {
    const response = await request("/babylon/costaking/v1/params");
    const params = response?.params ?? response;
    const costakingPortion = Number(
      params?.costakingPortion ?? params?.costaking_portion ?? 0,
    );
    const validatorsPortion = Number(
      params?.validatorsPortion ?? params?.validators_portion ?? 0,
    );
    const scoreRatioBtcByBaby =
      params?.scoreRatioBtcByBaby ?? params?.score_ratio_btc_by_baby ?? "50";
    return {
      costakingPortion: Number.isFinite(costakingPortion)
        ? costakingPortion
        : 0,
      validatorsPortion: Number.isFinite(validatorsPortion)
        ? validatorsPortion
        : 0,
      scoreRatioBtcByBaby: scoreRatioBtcByBaby,
    };
  },

  async getCoStakerRewardsTracker(costakerAddress: string): Promise<{
    startPeriodCumulativeReward: number;
    activeSatoshis: string;
    activeBaby: string;
    totalScore: string;
  } | null> {
    if (!costakerAddress) {
      return null;
    }

    try {
      const response = await request(
        `/babylon/costaking/v1/costakers/${costakerAddress}/rewards_tracker`,
      );

      return {
        startPeriodCumulativeReward:
          response?.startPeriodCumulativeReward ?? 0,
        activeSatoshis: response?.activeSatoshis ?? "0",
        activeBaby: response?.activeBaby ?? "0",
        totalScore: response?.totalScore ?? "0",
      };
    } catch (error: any) {
      // Return null for 404 errors (user has not co-staked yet)
      if (error?.message?.includes("404") || error?.status === 404) {
        return null;
      }
      throw new Error(
        `Failed to fetch co-staker rewards tracker for ${costakerAddress}`,
        {
          cause: error,
        },
      );
    }
  },

  async getCurrentCoStakingRewards(): Promise<{
    rewards: Array<{ denom: string; amount: string }>;
    period: number;
    totalScore: string;
  }> {
    try {
      const response = await request("/babylon/costaking/v1/current_rewards");

      return {
        rewards: response?.rewards ?? [],
        period: response?.period ?? 0,
        totalScore: response?.totalScore ?? "0",
      };
    } catch (error) {
      throw new Error("Failed to fetch current co-staking rewards", {
        cause: error,
      });
    }
  },

  async getAnnualProvisions(): Promise<number> {
    try {
      const response = await request("/cosmos/mint/v1beta1/annual_provisions");
      const annualProvisions =
        response?.annualProvisions ?? response?.annual_provisions ?? response;
      const result = Number(annualProvisions);
      return result;
    } catch (error) {
      throw new Error(`Failed to fetch annual provisions`, {
        cause: error,
      });
    }
  },

  async getSupply(denom: string = "ubbn"): Promise<bigint> {
    try {
      const response = await request("/cosmos/bank/v1beta1/supply/by_denom", {
        denom,
      });
      const amount = response?.amount?.amount ?? 0;
      return BigInt(amount);
    } catch (error: any) {
      throw new Error(`Failed to fetch supply for ${denom}`, {
        cause: error,
      });
    }
  },

  async getAnnualCoStakingRewardSupply(): Promise<number> {
    try {
      // Get annual provisions (total minted per year)
      const annualProvisions = await this.getAnnualProvisions();

      // Get incentive params (x/incentives takes first)
      const incentiveParams = await this.getIncentiveParams();
      const { btcStakingPortion, fpPortion } = incentiveParams;

      // Get costaking params (x/costaking takes from remaining)
      const costakingParams = await this.getCostakingParams();
      const { costakingPortion } = costakingParams;

      // Calculate cascade: co-staking receives a portion of what remains after incentives
      // Formula: annual_provisions × (1 - btc - fp) × costaking
      const afterIncentives = 1 - btcStakingPortion - fpPortion;
      const totalCoStakingRewards = annualProvisions * afterIncentives * costakingPortion;

      return totalCoStakingRewards;
    } catch (error) {
      throw new Error("Failed to calculate annual co-staking reward supply", {
        cause: error,
      });
    }
  },

  async getCurrentEpoch() {
    try {
      const { current_epoch, epoch_boundary } = await request(
        "/babylon/epoching/v1/current_epoch",
      );

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
