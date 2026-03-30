/**
 * Protocol Parameters Query Client
 *
 * Fetches protocol parameters from the ProtocolParams contract.
 * The ProtocolParams address is fetched from BTCVaultRegistry.
 */

import type { Address } from "viem";

import { CONTRACTS } from "@/config/contracts";

import BTCVaultRegistryAbi from "../btc-vault-registry/abis/BTCVaultRegistry.abi.json";
import { ethClient } from "../client";

import ProtocolParamsAbi from "./abis/ProtocolParams.abi.json";

/**
 * TBV Protocol Parameters from the contract
 */
export interface TBVProtocolParams {
  minimumPegInAmount: bigint;
  maxPegInAmount: bigint;
  pegInAckTimeout: bigint;
  peginActivationTimeout: bigint;
}

/**
 * Versioned offchain parameters from the ProtocolParams contract.
 * Used by off-chain actors for transaction graph construction.
 */
export interface VersionedOffchainParams {
  timelockAssert: bigint;
  timelockChallengeAssert: bigint;
  securityCouncilKeys: `0x${string}`[];
  councilQuorum: number;
  feeRate: bigint;
  babeTotalInstances: number;
  babeInstancesToFinalize: number;
  minVpCommissionBps: number;
  tRefund: number;
  tStale: number;
  minPeginFeeRate: bigint;
}

/**
 * Peg-in configuration parameters for deposit validation
 */
export interface PegInConfiguration {
  /** Minimum deposit amount in satoshis */
  minimumPegInAmount: bigint;
  /** Maximum deposit amount in satoshis */
  maxPegInAmount: bigint;
  /** Timeout for ACK collection in ETH blocks */
  pegInAckTimeout: bigint;
  /** Timeout for pegin activation in ETH blocks */
  peginActivationTimeout: bigint;
  /** CSV timelock in blocks for the PegIn vault output (from offchain params) */
  timelockPegin: number;
  /** CSV timelock in blocks for the Pre-PegIn HTLC refund path (from offchain params tRefund) */
  timelockRefund: number;
  /** Minimum vault provider commission in basis points (e.g., 500 = 5%) */
  minVpCommissionBps: number;
  /** Latest offchain params (for council quorum, fee rate, etc.) */
  offchainParams: VersionedOffchainParams;
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
 * Get the ProtocolParams contract address from BTCVaultRegistry
 */
export async function getProtocolParamsAddress(): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  const cached = protocolParamsAddressCache.get(chainId);
  if (cached) {
    return cached;
  }

  const address = await publicClient.readContract({
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: BTCVaultRegistryAbi,
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
    minimumPegInAmount: result.minimumPegInAmount,
    maxPegInAmount: result.maxPegInAmount,
    pegInAckTimeout: result.pegInAckTimeout,
    peginActivationTimeout: result.peginActivationTimeout,
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

  const timelockRefund = Number(offchainParams.tRefund);

  return {
    minimumPegInAmount: params.minimumPegInAmount,
    maxPegInAmount: params.maxPegInAmount,
    pegInAckTimeout: params.pegInAckTimeout,
    peginActivationTimeout: params.peginActivationTimeout,
    timelockPegin,
    timelockRefund,
    minVpCommissionBps: offchainParams.minVpCommissionBps,
    offchainParams,
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

/**
 * Get timelockPegin for a specific offchain params version.
 * timelockPegin = uint16(timelockAssert), matching PeginLogic.sol:115.
 *
 * Use the vault's locked offchainParamsVersion — using the latest version
 * would produce invalid signatures if timelockAssert changed after vault creation.
 */
export async function getTimelockPeginByVersion(
  offchainParamsVersion: number,
): Promise<number> {
  const params = await getOffchainParamsByVersion(offchainParamsVersion);
  return Number(params.timelockAssert);
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
