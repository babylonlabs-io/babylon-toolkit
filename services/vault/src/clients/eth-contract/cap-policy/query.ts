/**
 * CapPolicy query client.
 *
 * Resolves the CapPolicy address via BTCVaultRegistry.capPolicy() with a short
 * TTL (so a registry governance update propagates without requiring a page
 * reload) and exposes application-scoped cap + usage reads.
 *
 * ### Units
 * All BTC quantities returned by CapPolicy — `totalCapBTC`, `perAddressCapBTC`,
 * `getApplicationTotalBTC`, `getApplicationUserBTC` — are denominated in
 * **satoshis**, matching the satoshi convention used throughout the vault
 * frontend. The `BTC` suffix on ABI field names comes from the contract struct
 * and does NOT mean whole BTC. Callers must treat the returned bigints as
 * satoshi counts.
 */

import type { Address } from "viem";

import { CONTRACTS } from "@/config/contracts";

import BTCVaultRegistryAbi from "../btc-vault-registry/abis/BTCVaultRegistry.abi.json";
import { ethClient } from "../client";

import CapPolicyAbi from "./abis/CapPolicy.abi.json";

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const CAP_POLICY_ADDRESS_TTL_MS = 60_000;

export interface ApplicationCap {
  /** Total BTC cap for the app, in satoshis. 0 = unlimited. */
  totalCapBTC: bigint;
  /** Per-address BTC cap for the app, in satoshis. 0 = unlimited. */
  perAddressCapBTC: bigint;
}

export interface ApplicationUsage {
  /** Current total BTC locked across all users in this application, in satoshis. */
  totalBTC: bigint;
  /** Current BTC locked by the user in this application, in satoshis, or null when no user. */
  userBTC: bigint | null;
}

interface CachedCapPolicyAddress {
  address: Address;
  fetchedAt: number;
}

const capPolicyAddressCache = new Map<number, CachedCapPolicyAddress>();

async function getCapPolicyAddress(): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  const cached = capPolicyAddressCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < CAP_POLICY_ADDRESS_TTL_MS) {
    return cached.address;
  }

  let address: Address;
  try {
    address = (await publicClient.readContract({
      address: CONTRACTS.BTC_VAULT_REGISTRY,
      abi: BTCVaultRegistryAbi,
      functionName: "capPolicy",
    })) as Address;
  } catch (error) {
    // Drop any stale entry so the next call re-attempts from the registry.
    capPolicyAddressCache.delete(chainId);
    throw error;
  }

  if (address === ZERO_ADDRESS) {
    capPolicyAddressCache.delete(chainId);
    throw new Error(
      "CapPolicy address is not configured in BTCVaultRegistry (got 0x0).",
    );
  }

  capPolicyAddressCache.set(chainId, { address, fetchedAt: Date.now() });
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
