/**
 * Protocol Parameters Query Client
 *
 * Fetches protocol parameters from the ProtocolParams contract.
 * The ProtocolParams address is fetched from BTCVaultRegistry.
 */

import type { Abi, Address } from "viem";

import { CONTRACTS } from "@/config/contracts";

import BTCVaultRegistryAbi from "../btc-vault-registry/abis/BTCVaultRegistry.abi.json";
import { ethClient } from "../client";

import ProtocolParamsAbi from "./abis/ProtocolParams.abi.json";
import {
  validateOffchainParams,
  validatePegInConfiguration,
  validateTBVProtocolParams,
} from "./validation";

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
 * TTL for the protocol params address cache.
 * Matches the React Query stale time in ProtocolParamsContext so that
 * a governance contract upgrade is picked up on the next re-fetch cycle.
 */
const ADDRESS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedAddress {
  address: Address;
  fetchedAt: number;
}

/**
 * Cache for protocol params address, keyed by chainId.
 * This ensures correct address is used when switching networks.
 * Entries expire after ADDRESS_CACHE_TTL_MS so governance upgrades are detected.
 */
const protocolParamsAddressCache = new Map<number, CachedAddress>();

/**
 * Get the ProtocolParams contract address from BTCVaultRegistry
 */
async function getProtocolParamsAddress(): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  const cached = protocolParamsAddressCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < ADDRESS_CACHE_TTL_MS) {
    return cached.address;
  }

  const address = await publicClient.readContract({
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: BTCVaultRegistryAbi,
    functionName: "protocolParams",
  });

  protocolParamsAddressCache.set(chainId, {
    address: address as Address,
    fetchedAt: Date.now(),
  });
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
  validateTBVProtocolParams(result);

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

  const params = result as VersionedOffchainParams;
  validateOffchainParams(params);
  return params;
}

/**
 * Get peg-in configuration from the ProtocolParams contract.
 * Fetches both on-chain protocol params and offchain params to provide
 * all values needed for pegin transaction construction.
 */
export async function getPegInConfiguration(): Promise<PegInConfiguration> {
  const publicClient = ethClient.getPublicClient();
  const protocolParamsAddress = await getProtocolParamsAddress();

  // Fetch both param sets in a single multicall to guarantee same-block atomicity.
  // Separate RPC calls risk TOCTOU inconsistency if governance updates params between reads.
  const [rawParams, rawOffchainParams] = await publicClient.multicall({
    contracts: [
      {
        address: protocolParamsAddress,
        abi: ProtocolParamsAbi,
        functionName: "getTBVProtocolParams",
      },
      {
        address: protocolParamsAddress,
        abi: ProtocolParamsAbi,
        functionName: "getLatestOffchainParams",
      },
    ],
    allowFailure: false,
  });

  const params = rawParams as unknown as TBVProtocolParams;
  const offchainParams =
    rawOffchainParams as unknown as VersionedOffchainParams;

  // timelockPegin = uint16(timelockAssert), matching PeginLogic.sol:115
  const timelockPegin = Number(offchainParams.timelockAssert);

  const timelockRefund = Number(offchainParams.tRefund);

  const config: PegInConfiguration = {
    minimumPegInAmount: params.minimumPegInAmount,
    maxPegInAmount: params.maxPegInAmount,
    pegInAckTimeout: params.pegInAckTimeout,
    peginActivationTimeout: params.peginActivationTimeout,
    timelockPegin,
    timelockRefund,
    minVpCommissionBps: offchainParams.minVpCommissionBps,
    offchainParams,
  };

  validatePegInConfiguration(config);

  return config;
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

  const params = result as VersionedOffchainParams;
  validateOffchainParams(params);
  return params;
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

  const publicClient = ethClient.getPublicClient();
  const protocolParamsAddress = await getProtocolParamsAddress();

  // Fetch all versions in a single multicall for same-block consistency
  const versions = Array.from({ length: latestVersion }, (_, i) => i + 1);
  const contracts = versions.map((v) => ({
    address: protocolParamsAddress,
    abi: ProtocolParamsAbi as Abi,
    functionName: "getOffchainParamsByVersion" as const,
    args: [v] as const,
  }));

  const results = await publicClient.multicall({
    contracts,
    allowFailure: false,
  });

  const byVersion = new Map<number, VersionedOffchainParams>();
  for (let i = 0; i < versions.length; i++) {
    const params = results[i] as unknown as VersionedOffchainParams;
    validateOffchainParams(params);
    byVersion.set(versions[i], params);
  }

  return { byVersion, latestVersion };
}
