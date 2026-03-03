/**
 * Protocol Parameters Query Client
 *
 * Fetches protocol parameters from the ProtocolParams contract.
 * The ProtocolParams address is fetched from BTCVaultsManager.
 */

import type { Address } from "viem";

import { CONTRACTS } from "@/config/contracts";

import BTCVaultsManagerAbi from "../btc-vaults-manager/abis/BTCVaultsManager.abi.json";
import { ethClient } from "../client";

import ProtocolParamsAbi from "./abis/ProtocolParams.abi.json";

/**
 * TBV Protocol Parameters from the contract
 */
export interface TBVProtocolParams {
  btcPrismAddress: Address;
  minimumPegInAmount: bigint;
  maxPegInAmount: bigint;
  pegInActivationTimeout: bigint;
  pegInConfirmationDepth: bigint;
}

/**
 * Versioned offchain parameters from the ProtocolParams contract.
 * Used by off-chain actors for transaction graph construction.
 */
export interface VersionedOffchainParams {
  timelockAssert: bigint;
  timelockChallengeAssert: bigint;
  securityCouncilKeys: `0x${string}`[];
  feeRate: bigint;
  feeMarginPercent: number;
  challengerOutputValue: bigint;
  payoutNopayoutOutputValue: bigint;
  babeTotalInstances: number;
  babeInstancesToFinalize: number;
  vpCommissionBps: number;
}

/**
 * Peg-in configuration parameters for deposit validation
 */
export interface PegInConfiguration {
  /** Minimum deposit amount in satoshis */
  minimumPegInAmount: bigint;
  /** Maximum deposit amount in satoshis */
  maxPegInAmount: bigint;
  /** Timeout for peg-in activation in ETH blocks */
  pegInActivationTimeout: bigint;
  /** Required BTC confirmation depth */
  pegInConfirmationDepth: bigint;
  /** CSV timelock in blocks for the PegIn output (from offchain params) */
  timelockPegin: number;
  /** Value in satoshis for the depositor's claim output (from offchain params) */
  depositorClaimValue: bigint;
  /** Vault provider commission in basis points (e.g., 500 = 5%) */
  vpCommissionBps: number;
}

/**
 * Cache for protocol params address, keyed by chainId.
 * This ensures correct address is used when switching networks.
 */
const protocolParamsAddressCache = new Map<number, Address>();

/**
 * Clear the protocol params address cache.
 *
 * Call this when:
 * - After contract upgrades
 * - During testing to reset state
 */
export function clearProtocolParamsCache(): void {
  protocolParamsAddressCache.clear();
}

/**
 * Get the ProtocolParams contract address from BTCVaultsManager
 */
export async function getProtocolParamsAddress(): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  const cached = protocolParamsAddressCache.get(chainId);
  if (cached) {
    return cached;
  }

  const address = await publicClient.readContract({
    address: CONTRACTS.BTC_VAULTS_MANAGER,
    abi: BTCVaultsManagerAbi,
    functionName: "protocolParams",
  });

  protocolParamsAddressCache.set(chainId, address as Address);
  return address as Address;
}

/**
 * Get all TBV protocol parameters from the ProtocolParams contract
 */
export async function getTBVProtocolParams(): Promise<TBVProtocolParams> {
  const publicClient = ethClient.getPublicClient();
  const protocolParamsAddress = await getProtocolParamsAddress();

  const params = await publicClient.readContract({
    address: protocolParamsAddress,
    abi: ProtocolParamsAbi,
    functionName: "getTBVProtocolParams",
  });

  // Viem returns named tuple components as an object with named properties
  const result = params as TBVProtocolParams;

  return {
    btcPrismAddress: result.btcPrismAddress,
    minimumPegInAmount: result.minimumPegInAmount,
    maxPegInAmount: result.maxPegInAmount,
    pegInActivationTimeout: result.pegInActivationTimeout,
    pegInConfirmationDepth: result.pegInConfirmationDepth,
  };
}

/**
 * Get the latest versioned offchain parameters from the ProtocolParams contract.
 * These include timelocks, fee rates, and output values used for transaction construction.
 */
export async function getLatestOffchainParams(): Promise<VersionedOffchainParams> {
  const publicClient = ethClient.getPublicClient();
  const protocolParamsAddress = await getProtocolParamsAddress();

  const result = await publicClient.readContract({
    address: protocolParamsAddress,
    abi: ProtocolParamsAbi,
    functionName: "getLatestOffchainParams",
  });

  return result as VersionedOffchainParams;
}

/**
 * Get peg-in configuration from the ProtocolParams contract.
 * Fetches both on-chain protocol params and offchain params to provide
 * all values needed for pegin transaction construction.
 */
export async function getPegInConfiguration(): Promise<PegInConfiguration> {
  const [params, offchainParams] = await Promise.all([
    getTBVProtocolParams(),
    getLatestOffchainParams(),
  ]);

  // timelockPegin = uint16(timelockAssert), matching PeginLogic.sol:115
  const timelockPegin = Number(offchainParams.timelockAssert);

  // TODO: Replace with value from contract once btc-vault exposes
  // depositorClaimValue as a parameter. Must cover the full downstream
  // tx graph (Claim → Assert → Payout).
  const depositorClaimValue = 500_000n;

  return {
    minimumPegInAmount: params.minimumPegInAmount,
    maxPegInAmount: params.maxPegInAmount,
    pegInActivationTimeout: params.pegInActivationTimeout,
    pegInConfirmationDepth: params.pegInConfirmationDepth,
    timelockPegin,
    depositorClaimValue,
    vpCommissionBps: offchainParams.vpCommissionBps,
  };
}

/**
 * Get the latest offchain params version number from the contract.
 */
export async function getLatestOffchainParamsVersion(): Promise<number> {
  const publicClient = ethClient.getPublicClient();
  const protocolParamsAddress = await getProtocolParamsAddress();

  const version = await publicClient.readContract({
    address: protocolParamsAddress,
    abi: ProtocolParamsAbi,
    functionName: "latestOffchainParamsVersion",
  });

  return Number(version);
}

/**
 * Get offchain parameters for a specific version from the contract.
 */
export async function getOffchainParamsByVersion(
  versionNumber: number,
): Promise<VersionedOffchainParams> {
  const publicClient = ethClient.getPublicClient();
  const protocolParamsAddress = await getProtocolParamsAddress();

  const result = await publicClient.readContract({
    address: protocolParamsAddress,
    abi: ProtocolParamsAbi,
    functionName: "getOffchainParamsByVersion",
    args: [versionNumber],
  });

  return result as VersionedOffchainParams;
}

/** All offchain params grouped by version */
export interface AllOffchainParamsData {
  byVersion: Map<number, VersionedOffchainParams>;
  latestVersion: number;
}

/**
 * Fetches all offchain params versions from the contract.
 * Iterates from version 1 to latestOffchainParamsVersion and fetches each.
 *
 * Used by ProtocolParamsContext to load all versions at page init so that
 * depositor graph signing can look up params by the vault's locked version.
 */
export async function fetchAllOffchainParams(): Promise<AllOffchainParamsData> {
  const latestVersion = await getLatestOffchainParamsVersion();

  if (latestVersion === 0) {
    return { byVersion: new Map(), latestVersion: 0 };
  }

  // Fetch all versions in parallel
  const versions = Array.from({ length: latestVersion }, (_, i) => i + 1);
  const results = await Promise.all(
    versions.map((v) => getOffchainParamsByVersion(v)),
  );

  const byVersion = new Map<number, VersionedOffchainParams>();
  for (let i = 0; i < versions.length; i++) {
    byVersion.set(versions[i], results[i]);
  }

  return { byVersion, latestVersion };
}

/**
 * Get just the minimum peg-in amount from the contract
 * More efficient if you only need this single value
 */
export async function getMinimumPegInAmount(): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();
  const protocolParamsAddress = await getProtocolParamsAddress();

  const amount = await publicClient.readContract({
    address: protocolParamsAddress,
    abi: ProtocolParamsAbi,
    functionName: "minimumPegInAmount",
  });

  return amount as bigint;
}
