/**
 * CapPolicy query client.
 *
 * Resolves the CapPolicy address via BTCVaultRegistry.capPolicy(), caches it
 * per chainId, and exposes application-scoped cap + usage reads.
 */

import type { Address } from "viem";

import { CONTRACTS } from "@/config/contracts";

import BTCVaultRegistryAbi from "../btc-vault-registry/abis/BTCVaultRegistry.abi.json";
import { ethClient } from "../client";

import CapPolicyAbi from "./abis/CapPolicy.abi.json";

export interface ApplicationCap {
  /** Total BTC cap for the app in satoshis. 0 = unlimited. */
  totalCapBTC: bigint;
  /** Per-address BTC cap for the app in satoshis. 0 = unlimited. */
  perAddressCapBTC: bigint;
}

export interface ApplicationUsage {
  /** Current total BTC locked across all users in this application (sats). */
  totalBTC: bigint;
  /** Current BTC locked by the user in this application (sats), or null when no user. */
  userBTC: bigint | null;
}

const capPolicyAddressCache = new Map<number, Address>();

async function getCapPolicyAddress(): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  const cached = capPolicyAddressCache.get(chainId);
  if (cached) return cached;

  const address = (await publicClient.readContract({
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: BTCVaultRegistryAbi,
    functionName: "capPolicy",
  })) as Address;

  capPolicyAddressCache.set(chainId, address);
  return address;
}

/**
 * Read the configured cap parameters for an application entry point.
 */
export async function getApplicationCap(
  appEntryPoint: Address,
): Promise<ApplicationCap> {
  const publicClient = ethClient.getPublicClient();
  const capPolicy = await getCapPolicyAddress();

  const caps = (await publicClient.readContract({
    address: capPolicy,
    abi: CapPolicyAbi,
    functionName: "getApplicationCaps",
    args: [appEntryPoint],
  })) as ApplicationCap;

  return {
    totalCapBTC: caps.totalCapBTC,
    perAddressCapBTC: caps.perAddressCapBTC,
  };
}

/**
 * Read current BTC usage for an application, optionally scoped to a user.
 */
export async function getApplicationUsage(
  appEntryPoint: Address,
  user?: Address,
): Promise<ApplicationUsage> {
  const publicClient = ethClient.getPublicClient();
  const capPolicy = await getCapPolicyAddress();

  const totalBTC = (await publicClient.readContract({
    address: capPolicy,
    abi: CapPolicyAbi,
    functionName: "getApplicationTotalBTC",
    args: [appEntryPoint],
  })) as bigint;

  if (!user) {
    return { totalBTC, userBTC: null };
  }

  const userBTC = (await publicClient.readContract({
    address: capPolicy,
    abi: CapPolicyAbi,
    functionName: "getApplicationUserBTC",
    args: [appEntryPoint, user],
  })) as bigint;

  return { totalBTC, userBTC };
}

/**
 * Test-only helper. Exposed so test setup can reset the cross-test address cache.
 * Not part of the public API; consumers should never call this in production.
 */
export function __resetCapPolicyAddressCacheForTests(): void {
  capPolicyAddressCache.clear();
}
