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
    vpRegistrationFee: result.vpRegistrationFee,
    feeCollector: result.feeCollector,
    minimumPegInAmount: result.minimumPegInAmount,
    pegInFee: result.pegInFee,
    pegInActivationTimeout: result.pegInActivationTimeout,
    pegInConfirmationDepth: result.pegInConfirmationDepth,
    liquidatorFeeBps: result.liquidatorFeeBps,
    arbitrageurDiscountBps: result.arbitrageurDiscountBps,
    coreSpokeLiquidationFeeBps: result.coreSpokeLiquidationFeeBps,
    protocolFeeRecipient: result.protocolFeeRecipient,
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
