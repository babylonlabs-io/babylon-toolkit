import Transport from "@ledgerhq/hw-transport";
import {
  expansionTxPolicy,
  slashingPathPolicy,
  stakingTxPolicy,
  unbondingPathPolicy,
  WalletPolicy,
  withdrawPathPolicy,
} from "ledger-bitcoin-babylon-boilerplate";

import { Action, Contract } from "@/core/types";
import { ActionName } from "@/core/utils/action";
import { BABYLON_SIGNING_CONTRACTS } from "@/core/utils/contracts";
import { sortPkHexes } from "@/core/utils/sortPkHexes";

export const getPolicyForTransaction = async (
  transport: Transport,
  derivationPath: string,
  {
    contracts,
    action,
    addressIndex,
  }: {
    contracts: Contract[];
    action: Action;
    addressIndex: number;
  },
): Promise<WalletPolicy> => {
  // Append the last two levels for address index (normal/change = 0, index = addressIndex)
  const fullDerivationPath = `${derivationPath}/0/${addressIndex}`;

  switch (action.name) {
    case ActionName.SIGN_BTC_STAKING_TRANSACTION:
      return getStakingPolicy(contracts, fullDerivationPath, transport);
    case ActionName.SIGN_BTC_STAKING_EXPANSION_TRANSACTION:
      return getExpansionPolicy(contracts, fullDerivationPath, transport);
    case ActionName.SIGN_BTC_UNBONDING_TRANSACTION:
      return getUnbondingPolicy(contracts, fullDerivationPath, transport);
    case ActionName.SIGN_BTC_SLASHING_TRANSACTION:
      return getSlashingPolicy(contracts, fullDerivationPath, transport);
    case ActionName.SIGN_BTC_UNBONDING_SLASHING_TRANSACTION:
      return getUnbondingSlashingPolicy(contracts, fullDerivationPath, transport);
    case ActionName.SIGN_BTC_WITHDRAW_TRANSACTION:
      return getWithdrawPolicy(contracts, fullDerivationPath, transport);
    default:
      throw new Error(`Unknown action: ${action.name}`);
  }
};

export const getStakingPolicy = (
  signingContracts: Contract[],
  derivationPath: string,
  transport: Transport,
): Promise<WalletPolicy> => {
  const stakingContract = signingContracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.STAKING);
  if (!stakingContract) {
    throw new Error("Staking contract is required");
  }

  const { finalityProviders, covenantThreshold, covenantPks, stakingDuration } = stakingContract.params;

  return stakingTxPolicy({
    transport,
    params: {
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      timelockBlocks: stakingDuration as number,
    },
    derivationPath,
  });
};

export const getExpansionPolicy = (
  signingContracts: Contract[],
  derivationPath: string,
  transport: Transport,
): Promise<WalletPolicy> => {
  const expansionContract = signingContracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.STAKING_EXPANSION);
  if (!expansionContract) {
    throw new Error("Expansion contract is required");
  }

  const { finalityProviders, covenantThreshold, covenantPks, stakingDuration } = expansionContract.params;

  return expansionTxPolicy({
    transport,
    params: {
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      timelockBlocks: stakingDuration as number,
    },
    derivationPath,
  });
};

export const getUnbondingPolicy = (
  contracts: Contract[],
  derivationPath: string,
  transport: Transport,
): Promise<WalletPolicy> => {
  const unbondingContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.UNBONDING);
  if (!unbondingContract) {
    throw new Error("Unbonding contract is required");
  }

  const { finalityProviders, covenantThreshold, covenantPks, unbondingTimeBlocks, unbondingFeeSat } =
    unbondingContract.params;

  return unbondingPathPolicy({
    transport,
    params: {
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      timelockBlocks: unbondingTimeBlocks as number,
      unbondingFeeSat: unbondingFeeSat as number,
    },
    derivationPath,
  });
};

export const getSlashingPolicy = (
  contracts: Contract[],
  derivationPath: string,
  transport: Transport,
): Promise<WalletPolicy> => {
  const slashingContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.SLASHING);
  if (!slashingContract) {
    throw new Error("Slashing contract is required in slashing transaction");
  }
  const stakingContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.STAKING);
  if (!stakingContract) {
    throw new Error("Staking contract is required in slashing transaction");
  }

  const slashingBurnContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.SLASHING_BURN);
  if (!slashingBurnContract) {
    throw new Error("Slashing burn contract is required in unbonding slashing transaction");
  }

  const { unbondingTimeBlocks, slashingFeeSat } = slashingContract.params;
  const { covenantPks, finalityProviders, covenantThreshold } = stakingContract.params;

  const { slashingPkScriptHex } = slashingBurnContract.params;

  return slashingPathPolicy({
    transport,
    params: {
      timelockBlocks: unbondingTimeBlocks as number,
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      slashingPkScriptHex: slashingPkScriptHex as string,
      slashingFeeSat: slashingFeeSat as number,
    },
    derivationPath,
  });
};

export const getUnbondingSlashingPolicy = (
  contracts: Contract[],
  derivationPath: string,
  transport: Transport,
): Promise<WalletPolicy> => {
  const slashingContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.SLASHING);
  if (!slashingContract) {
    throw new Error("Slashing contract is required in unbonding slashing transaction");
  }
  const unbondingContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.UNBONDING);
  if (!unbondingContract) {
    throw new Error("Unbonding contract is required in unbonding slashing transaction");
  }

  const slashingBurnContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.SLASHING_BURN);
  if (!slashingBurnContract) {
    throw new Error("Slashing burn contract is required in unbonding slashing transaction");
  }

  const { unbondingTimeBlocks, slashingFeeSat } = slashingContract.params;
  const { covenantPks, finalityProviders, covenantThreshold } = unbondingContract.params;

  const { slashingPkScriptHex } = slashingBurnContract.params;

  return slashingPathPolicy({
    transport,
    params: {
      timelockBlocks: unbondingTimeBlocks as number,
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      slashingPkScriptHex: slashingPkScriptHex as string,
      slashingFeeSat: slashingFeeSat as number,
    },
    derivationPath,
  });
};

const getWithdrawPolicy = (
  contracts: Contract[],
  derivationPath: string,
  transport: Transport,
): Promise<WalletPolicy> => {
  const withdrawContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.WITHDRAW);
  if (!withdrawContract) {
    throw new Error("Withdraw timelock expired contract is required");
  }

  const { timelockBlocks } = withdrawContract.params;

  return withdrawPathPolicy({
    transport,
    params: {
      timelockBlocks: timelockBlocks as number,
    },
    derivationPath,
  });
};
