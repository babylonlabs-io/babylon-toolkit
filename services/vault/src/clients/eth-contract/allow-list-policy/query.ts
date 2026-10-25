/**
 * Depositor allow-list read.
 *
 * The registry refuses a peg-in registration with `DepositNotAllowed()` when
 * `AllowListPolicy.checkAllowed(applicationEntryPoint, depositor)` is false
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/lib/PeginLogic.sol:269-272),
 * so asking the same view first tells the deposit form, and the deposit flow
 * before its first signing prompt, whether the registration would go through.
 *
 * Not to be confused with the application's `allowedToDeposit`, which is the
 * position-capacity check (`application-entry-point`).
 *
 * The policy address is resolved through `BTCVaultRegistry.allowListPolicy()`
 * with the same short TTL as the CapPolicy resolver. Self-contained ABI
 * fragments: the SDK's bundled registry ABI has neither view.
 */

import type { Address } from "viem";

import { CONTRACTS } from "@/config/contracts";

import { ethClient } from "../client";

/**
 * `BTCVaultRegistry.allowListPolicy()`
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/BTCVaultRegistry.sol:74).
 */
const REGISTRY_ALLOW_LIST_POLICY_ABI = [
  {
    type: "function",
    name: "allowListPolicy",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/**
 * `AllowListPolicy.checkAllowed`
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/AllowListPolicy.sol:102-105).
 * True when the application's gate is removed or the depositor is listed.
 * `isDepositorAllowed` is not a substitute: it reports the listing alone and
 * ignores whether the gate is removed.
 */
const CHECK_ALLOWED_ABI = [
  {
    type: "function",
    name: "checkAllowed",
    stateMutability: "view",
    inputs: [
      { name: "appEntryPoint", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const ALLOW_LIST_POLICY_ADDRESS_TTL_MS = 60_000;

interface CachedAllowListPolicyAddress {
  address: Address;
  fetchedAt: number;
}

const allowListPolicyAddressCache = new Map<
  number,
  CachedAllowListPolicyAddress
>();

async function getAllowListPolicyAddress(): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  const chainId = publicClient.chain.id;

  const cached = allowListPolicyAddressCache.get(chainId);
  if (
    cached &&
    Date.now() - cached.fetchedAt < ALLOW_LIST_POLICY_ADDRESS_TTL_MS
  ) {
    return cached.address;
  }

  let address: Address;
  try {
    address = await publicClient.readContract({
      address: CONTRACTS.BTC_VAULT_REGISTRY,
      abi: REGISTRY_ALLOW_LIST_POLICY_ABI,
      functionName: "allowListPolicy",
    });
  } catch (error) {
    // Drop any stale entry so the next call re-attempts from the registry.
    allowListPolicyAddressCache.delete(chainId);
    throw error;
  }

  if (address === ZERO_ADDRESS) {
    allowListPolicyAddressCache.delete(chainId);
    throw new Error(
      "AllowListPolicy address is not configured in BTCVaultRegistry (got 0x0).",
    );
  }

  allowListPolicyAddressCache.set(chainId, { address, fetchedAt: Date.now() });
  return address;
}

export interface ReadDepositorAllowedParams {
  /** The application the deposit's vault provider is registered to. */
  applicationEntryPoint: Address;
  /** The Ethereum account that sends the registration. */
  depositor: Address;
}

/**
 * Whether the registry would let `depositor` register a peg-in into
 * `applicationEntryPoint` right now. Advisory: the admin can change the list
 * between this read and the registration. A failed read throws; callers decide
 * how to fail.
 */
export async function readDepositorAllowed(
  params: ReadDepositorAllowedParams,
): Promise<boolean> {
  const { applicationEntryPoint, depositor } = params;
  const policyAddress = await getAllowListPolicyAddress();

  return ethClient.getPublicClient().readContract({
    address: policyAddress,
    abi: CHECK_ALLOWED_ABI,
    functionName: "checkAllowed",
    args: [applicationEntryPoint, depositor],
  });
}
