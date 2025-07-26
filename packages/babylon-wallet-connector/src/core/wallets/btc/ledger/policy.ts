import Transport from "@ledgerhq/hw-transport";
import {
  computeLeafHash,
  slashingPathPolicy,
  SlashingPolicy,
  StakingTxPolicy,
  stakingTxPolicy,
  timelockPathPolicy,
  TimelockPolicy,
  unbondingPathPolicy,
  UnbondingPolicy,
  WalletPolicy,
} from "ledger-bitcoin-babylon";

import { Action, Contract, Network } from "@/core/types";
import { ActionName } from "@/core/utils/action";
import { BABYLON_SIGNING_CONTRACTS } from "@/core/utils/contracts";
import { sortPkHexes } from "@/core/utils/sortPkHexes";

export const UNBONDING_POLICY: UnbondingPolicy = "Unbonding";
export const SLASHING_POLICY: SlashingPolicy = "Consent to slashing";
export const UNBONDING_SLASHING_POLICY: SlashingPolicy = "Consent to unbonding slashing";
export const STAKING_POLICY: StakingTxPolicy = "Staking transaction";
export const WITHDRAWAL_POLICY: TimelockPolicy = "Withdraw";

export const getPolicyForTransaction = async (
  transport: Transport,
  network: Network,
  derivationPath: string,
  psbtBase64: string,
  {
    contracts,
    action,
  }: {
    contracts: Contract[];
    action: Action;
  },
): Promise<WalletPolicy> => {
  const isTestnet = network !== Network.MAINNET;

  switch (action.name) {
    case ActionName.SIGN_BTC_STAKING_TRANSACTION:
      return getStakingPolicy(contracts, derivationPath, transport, isTestnet);
    case ActionName.SIGN_BTC_UNBONDING_TRANSACTION:
      return getUnbondingPolicy(contracts, derivationPath, transport, isTestnet, psbtBase64);
    case ActionName.SIGN_BTC_SLASHING_TRANSACTION:
      return getSlashingPolicy(contracts, derivationPath, transport, isTestnet, psbtBase64);
    case ActionName.SIGN_BTC_UNBONDING_SLASHING_TRANSACTION:
      return getUnbondingSlashingPolicy(contracts, derivationPath, transport, isTestnet, psbtBase64);
    case ActionName.SIGN_BTC_WITHDRAW_TRANSACTION:
      return getWithdrawPolicy(contracts, derivationPath, psbtBase64, transport, isTestnet);
    default:
      throw new Error(`Unknown action: ${action.name}`);
  }
};

export const getStakingPolicy = (
  signingContracts: Contract[],
  derivationPath: string,
  transport: Transport,
  isTestnet: boolean,
): Promise<WalletPolicy> => {
  const stakingContract = signingContracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.STAKING);
  if (!stakingContract) {
    throw new Error("Staking contract is required");
  }

  const { finalityProviders, covenantThreshold, covenantPks, stakingDuration } = stakingContract.params;

  return stakingTxPolicy({
    policyName: STAKING_POLICY,
    transport,
    params: {
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      timelockBlocks: stakingDuration as number,
    },
    derivationPath,
    isTestnet,
  });
};

export const getUnbondingPolicy = (
  contracts: Contract[],
  derivationPath: string,
  transport: Transport,
  isTestnet: boolean,
  psbtBase64: string,
): Promise<WalletPolicy> => {
  const unbondingContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.UNBONDING);
  if (!unbondingContract) {
    throw new Error("Unbonding contract is required");
  }

  const leafHash = computeLeafHash(psbtBase64);
  if (!leafHash) {
    throw new Error("Could not compute leaf hash");
  }

  const { finalityProviders, covenantThreshold, covenantPks, unbondingTimeBlocks, unbondingFeeSat } =
    unbondingContract.params;

  return unbondingPathPolicy({
    policyName: UNBONDING_POLICY,
    transport,
    params: {
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      leafHash,
      timelockBlocks: unbondingTimeBlocks as number,
      unbondingFeeSat: unbondingFeeSat as number,
    },
    derivationPath,
    isTestnet,
  });
};

export const getSlashingPolicy = (
  contracts: Contract[],
  derivationPath: string,
  transport: Transport,
  isTestnet: boolean,
  psbtBase64: string,
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

  const leafHash = computeLeafHash(psbtBase64);
  if (!leafHash) {
    throw new Error("Could not compute leaf hash");
  }

  return slashingPathPolicy({
    policyName: SLASHING_POLICY,
    transport,
    params: {
      leafHash,
      timelockBlocks: unbondingTimeBlocks as number,
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      slashingPkScriptHex: slashingPkScriptHex as string,
      slashingFeeSat: slashingFeeSat as number,
    },
    derivationPath,
    isTestnet,
  });
};

export const getUnbondingSlashingPolicy = (
  contracts: Contract[],
  derivationPath: string,
  transport: Transport,
  isTestnet: boolean,
  psbtBase64: string,
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

  const leafHash = computeLeafHash(psbtBase64);
  if (!leafHash) {
    throw new Error("Could not compute leaf hash");
  }

  return slashingPathPolicy({
    policyName: UNBONDING_SLASHING_POLICY,
    transport,
    params: {
      leafHash,
      timelockBlocks: unbondingTimeBlocks as number,
      finalityProviders: finalityProviders as string[],
      covenantThreshold: covenantThreshold as number,
      covenantPks: sortPkHexes(covenantPks as string[]),
      slashingPkScriptHex: slashingPkScriptHex as string,
      slashingFeeSat: slashingFeeSat as number,
    },
    derivationPath,
    isTestnet,
  });
};

const getWithdrawPolicy = (
  contracts: Contract[],
  derivationPath: string,
  psbtBase64: string,
  transport: Transport,
  isTestnet: boolean,
): Promise<WalletPolicy> => {
  const withdrawContract = contracts.find((contract) => contract.id === BABYLON_SIGNING_CONTRACTS.WITHDRAW);
  if (!withdrawContract) {
    throw new Error("Withdraw timelock expired contract is required");
  }

  const { timelockBlocks } = withdrawContract.params;

  const leafHash = computeLeafHash(psbtBase64);
  if (!leafHash) {
    throw new Error("Could not compute leaf hash");
  }

  return timelockPathPolicy({
    policyName: WITHDRAWAL_POLICY,
    transport,
    params: {
      leafHash,
      timelockBlocks: timelockBlocks as number,
    },
    derivationPath,
    isTestnet,
  });
};
