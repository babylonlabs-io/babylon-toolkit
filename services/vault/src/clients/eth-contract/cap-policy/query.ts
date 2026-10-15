/**
 * CapPolicy query client.
 *
 * Resolves the CapPolicy address via BTCVaultRegistry.capPolicy() with a short
 * TTL (so a registry governance update propagates without requiring a page
 * reload) and exposes application-scoped cap + usage reads, and the
 * protocol-wide live-vault capacity.
 *
 * ### Units
 * All BTC quantities returned by CapPolicy — `totalCapBTC`, `perAddressCapBTC`,
 * `getApplicationTotalBTC`, `getApplicationUserBTC` — are denominated in
 * **satoshis**, matching the satoshi convention used throughout the vault
 * frontend. The `BTC` suffix on ABI field names comes from the contract struct
 * and does NOT mean whole BTC. Callers must treat the returned bigints as
 * satoshi counts.
 */

import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  type Address,
} from "viem";

import { CONTRACTS } from "@/config/contracts";

import { ethClient } from "../client";

import CapPolicyAbi from "./abis/CapPolicy.abi.json";

/**
 * Single-function ABI for `BTCVaultRegistry.capPolicy()`.
 * The full registry ABI in `@babylonlabs-io/ts-sdk/tbv/core` is the
 * signing/registration subset — it does not expose this getter — so we
 * keep the cap-policy address resolver self-contained.
 */
const REGISTRY_CAP_POLICY_ABI = [
  {
    type: "function",
    name: "capPolicy",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const CAP_POLICY_ADDRESS_TTL_MS = 60_000;
/** `reserveLiveVault()` processes one matured release before it checks the cap. */
const RELEASES_PER_RESERVATION = 1n;

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

/**
 * The function viem names when the multicall's own `eth_call` fails. viem maps
 * an RPC error such as -32603 on that call to a revert too, so a revert under
 * this name is a failed request, not a reverted call.
 */
const MULTICALL_FUNCTION_NAME = "aggregate3";

const isContractRevert = (error: Error): boolean =>
  error instanceof ContractFunctionExecutionError &&
  error.functionName !== MULTICALL_FUNCTION_NAME &&
  error.walk((cause) => cause instanceof ContractFunctionRevertedError) !==
    null;

async function getCapPolicyAddress(): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  const chainId = publicClient.chain.id;

  const cached = capPolicyAddressCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < CAP_POLICY_ADDRESS_TTL_MS) {
    return cached.address;
  }

  let address: Address;
  try {
    address = (await publicClient.readContract({
      address: CONTRACTS.BTC_VAULT_REGISTRY,
      abi: REGISTRY_CAP_POLICY_ABI,
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
 *
 * When a user is provided, the protocol-total and per-user reads are
 * collapsed into a single multicall round-trip — they target the same
 * `CapPolicy` contract with no inter-dependency. `allowFailure: false`
 * preserves the prior throw-on-revert semantics of the two separate
 * `readContract` calls.
 */
export async function getApplicationUsage(
  appEntryPoint: Address,
  user?: Address,
): Promise<ApplicationUsage> {
  const publicClient = ethClient.getPublicClient();
  const capPolicy = await getCapPolicyAddress();

  if (!user) {
    const totalBTC = (await publicClient.readContract({
      address: capPolicy,
      abi: CapPolicyAbi,
      functionName: "getApplicationTotalBTC",
      args: [appEntryPoint],
    })) as bigint;
    return { totalBTC, userBTC: null };
  }

  const [totalBTC, userBTC] = (await publicClient.multicall({
    contracts: [
      {
        address: capPolicy,
        abi: CapPolicyAbi,
        functionName: "getApplicationTotalBTC",
        args: [appEntryPoint],
      },
      {
        address: capPolicy,
        abi: CapPolicyAbi,
        functionName: "getApplicationUserBTC",
        args: [appEntryPoint, user],
      },
    ],
    allowFailure: false,
  })) as [bigint, bigint];

  return { totalBTC, userBTC };
}

/**
 * Read how many protocol-wide live-vault slots a registration can reserve,
 * `type(uint256).max` when the gate is off, or `null` when a call reverts. A
 * CapPolicy built before the live-vault cap reverts every call: that is an
 * expected state, so it returns `null` and does not throw into the query error
 * reporter. Any other failure, such as a transport error, still throws, so
 * React Query retries it and reports it.
 *
 * `getAvailableLiveVaultCapacity()` alone under-reports: it counts matured
 * slot releases that are not processed yet as taken, while each reservation
 * first processes one of them. So the multicall mirrors a two-BTCVault
 * registration: it runs the permissionless `releaseSettledVaults(1)` and reads
 * the capacity, twice. All four calls run in one `eth_call`, so each read sees
 * the releases before it and nothing is sent on chain.
 *
 * The first read decides whether one BTCVault fits, and the second whether two
 * do. The result is 0 when not even one fits, and the second read otherwise,
 * which is never lower than the first.
 */
export async function getAvailableLiveVaultSlots(): Promise<bigint | null> {
  const publicClient = ethClient.getPublicClient();
  const capPolicy = await getCapPolicyAddress();

  const releaseForOneReservation = {
    address: capPolicy,
    abi: CapPolicyAbi,
    functionName: "releaseSettledVaults",
    args: [RELEASES_PER_RESERVATION],
  };
  const readCapacity = {
    address: capPolicy,
    abi: CapPolicyAbi,
    functionName: "getAvailableLiveVaultCapacity",
  };
  const calls = await publicClient.multicall({
    contracts: [
      releaseForOneReservation,
      readCapacity,
      releaseForOneReservation,
      readCapacity,
    ],
    allowFailure: true,
  });
  // With `allowFailure`, viem also reports a failed `eth_call` as a failure on
  // every call, so only a revert of one of these calls may become `null`.
  const errors = calls.flatMap((call) =>
    call.status === "failure" ? [call.error] : [],
  );
  const unexpectedError = errors.find((error) => !isContractRevert(error));
  if (unexpectedError) throw unexpectedError;
  if (errors.length > 0) return null;

  const [, oneVault, , twoVaults] = calls.map((call) => call.result) as [
    unknown,
    bigint,
    unknown,
    bigint,
  ];
  return oneVault === 0n ? 0n : twoVaults;
}
