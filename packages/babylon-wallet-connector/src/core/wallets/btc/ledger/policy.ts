import Transport from "@ledgerhq/hw-transport";
import {
  slashingPathPolicy,
  stakingTxPolicy,
  withdrawPathPolicy,
  unbondingPathPolicy,
  WalletPolicy,
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
  }: {
    contracts: Contract[];
    action: Action;
  },
): Promise<WalletPolicy> => {
  derivationPath = derivationPath + "/0/0"; // Append the last two levels for address index
  console.log("Full Derivation Path:", derivationPath);
  // Convert derivation path to taproot (purpose 86)
  // const convertToTaprootPath = (path: string): string => {
  //   // Split the path and replace the purpose (first part after m/) with 86'
  //   const parts = path.split('/');
  //   if (parts.length > 1) {
  //     parts[1] = "86'"; // Set purpose to 86' for taproot
  //   }
  //   return parts.join('/');
  // };

  // const taprootPath = convertToTaprootPath(derivationPath);
  //console.log("Using derivation path for policy:", taprootPath);
  switch (action.name) {
    case ActionName.SIGN_BTC_STAKING_TRANSACTION:
      return getStakingPolicy(contracts, derivationPath, transport);
    case ActionName.SIGN_BTC_UNBONDING_TRANSACTION:
      return getUnbondingPolicy(contracts, derivationPath, transport);
    case ActionName.SIGN_BTC_SLASHING_TRANSACTION:
      return getSlashingPolicy(contracts, derivationPath, transport);
    case ActionName.SIGN_BTC_UNBONDING_SLASHING_TRANSACTION:
      return getUnbondingSlashingPolicy(contracts, derivationPath, transport);
    case ActionName.SIGN_BTC_WITHDRAW_TRANSACTION:
      return getWithdrawPolicy(contracts, derivationPath, transport);
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
