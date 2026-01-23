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
  vpRegistrationFee: bigint;
  feeCollector: Address;
  minimumPegInAmount: bigint;
  pegInFee: bigint;
  pegInActivationTimeout: bigint;
  pegInConfirmationDepth: bigint;
  liquidatorFeeBps: bigint;
  arbitrageurDiscountBps: bigint;
  coreSpokeLiquidationFeeBps: bigint;
  protocolFeeRecipient: Address;
}

/**
 * Peg-in configuration parameters for deposit validation
 */
export interface PegInConfiguration {
  /** Minimum deposit amount in satoshis */
  minimumPegInAmount: bigint;
  /** Fee for peg-in request in wei */
  pegInFee: bigint;
  /** Timeout for peg-in activation in ETH blocks */
  pegInActivationTimeout: bigint;
  /** Required BTC confirmation depth */
  pegInConfirmationDepth: bigint;
}

/**
 * Cache for protocol params address.
 *
 * This cache persists for the module lifetime. It should be cleared if:
 * - The network changes
 * - After a contract upgrade
 * - During development when switching environments
 *
 * In production, users should reload the application after contract upgrades.
 */
let protocolParamsAddressCache: Address | null = null;

/**
 * Clear the protocol params address cache.
 *
 * Call this when:
 * - Switching networks/environments
 * - After contract upgrades
 * - During testing to reset state
 */
export function clearProtocolParamsCache(): void {
  protocolParamsAddressCache = null;
}

/**
 * Get the ProtocolParams contract address from BTCVaultsManager
 */
export async function getProtocolParamsAddress(): Promise<Address> {
  if (protocolParamsAddressCache) {
    return protocolParamsAddressCache;
  }

  const publicClient = ethClient.getPublicClient();

  const address = await publicClient.readContract({
    address: CONTRACTS.BTC_VAULTS_MANAGER,
    abi: BTCVaultsManagerAbi,
    functionName: "protocolParams",
  });

  protocolParamsAddressCache = address as Address;
  return protocolParamsAddressCache;
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

  // Type assertion - viem returns tuple as array
  const result = params as [
    Address, // btcPrismAddress
    bigint, // vpRegistrationFee
    Address, // feeCollector
    bigint, // minimumPegInAmount
    bigint, // pegInFee
    bigint, // pegInActivationTimeout
    bigint, // pegInConfirmationDepth
    bigint, // liquidatorFeeBps
    bigint, // arbitrageurDiscountBps
    bigint, // coreSpokeLiquidationFeeBps
    Address, // protocolFeeRecipient
  ];

  return {
    btcPrismAddress: result[0],
    vpRegistrationFee: result[1],
    feeCollector: result[2],
    minimumPegInAmount: result[3],
    pegInFee: result[4],
    pegInActivationTimeout: result[5],
    pegInConfirmationDepth: result[6],
    liquidatorFeeBps: result[7],
    arbitrageurDiscountBps: result[8],
    coreSpokeLiquidationFeeBps: result[9],
    protocolFeeRecipient: result[10],
  };
}

/**
 * Get peg-in configuration from the ProtocolParams contract
 * This is a convenience function that returns only the peg-in related parameters
 */
export async function getPegInConfiguration(): Promise<PegInConfiguration> {
  const params = await getTBVProtocolParams();

  return {
    minimumPegInAmount: params.minimumPegInAmount,
    pegInFee: params.pegInFee,
    pegInActivationTimeout: params.pegInActivationTimeout,
    pegInConfirmationDepth: params.pegInConfirmationDepth,
  };
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
