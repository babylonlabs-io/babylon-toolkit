/**
 * The depositor's registered vaults, read from the BTCVaultRegistry.
 *
 * `getDepositorVaultIds` returns every vault the depositor ever submitted
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/BTCVaultRegistry.sol:1100-1102).
 * The list is push-only (`:1028`): a vault stays listed after it activates,
 * redeems or expires, so callers filter by each vault's on-chain status.
 *
 * Self-contained ABI fragment, same as the `application-entry-point` sibling:
 * the SDK's bundled registry ABI does not expose this view.
 */

import type { Address, Hex } from "viem";

import { CONTRACTS } from "@/config/contracts";

import { ethClient } from "../client";

/** Single-function ABI for `BTCVaultRegistry.getDepositorVaultIds`. */
const GET_DEPOSITOR_VAULT_IDS_ABI = [
  {
    type: "function",
    name: "getDepositorVaultIds",
    stateMutability: "view",
    inputs: [{ name: "depositor", type: "address" }],
    outputs: [{ name: "vaultIds", type: "bytes32[]" }],
  },
] as const;

/**
 * Every vault id the depositor registered, read at `blockNumber`. A failed read
 * throws; callers decide how to fail.
 */
export async function getDepositorVaultIdsFromChain(
  depositor: Address,
  blockNumber: bigint,
): Promise<readonly Hex[]> {
  return ethClient.getPublicClient().readContract({
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: GET_DEPOSITOR_VAULT_IDS_ABI,
    functionName: "getDepositorVaultIds",
    args: [depositor],
    blockNumber,
  });
}
