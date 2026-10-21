/**
 * Application entry-point position-capacity read.
 *
 * `allowedToDeposit` is the application's own answer to "would this position
 * accept N more vaults totalling X sats right now". The Aave adapter evaluates
 * it with `_allowedToDeposit`
 * (vault-contracts-aave-v4@99a4e3e7:src/applications/aave/AaveAdapter.sol:635-642),
 * the same check its `activateVault` runs per vault
 * (vault-contracts-aave-v4@99a4e3e7:src/applications/aave/AaveAdapter.sol:148-150),
 * so reading it before a deposit's registration and before its Pre-PegIn
 * broadcast predicts the activation-time size check.
 *
 * Self-contained ABI fragment, same as the `application-status` sibling: the
 * SDK's bundled adapter ABI does not expose this view.
 */

import type { Address } from "viem";

import { ethClient } from "../client";

/**
 * Single-function ABI for `IApplicationEntryPoint.allowedToDeposit`
 * (vault-contracts-aave-v4@99a4e3e7:src/interfaces/IApplicationEntryPoint.sol:35).
 */
const ALLOWED_TO_DEPOSIT_ABI = [
  {
    type: "function",
    name: "allowedToDeposit",
    stateMutability: "view",
    inputs: [
      { name: "vaultReceiver", type: "address" },
      { name: "nVaultsToDeposit", type: "uint256" },
      { name: "amountToDeposit", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface ReadAllowedToDepositParams {
  /** The vault's own on-chain `applicationEntryPoint` — the adapter to ask. */
  applicationEntryPoint: Address;
  /** Position account the vaults would activate into. */
  vaultReceiver: Address;
  /** Vaults to add on top of the position's collateralized ones. */
  nVaultsToDeposit: bigint;
  /** Total amount of those vaults, in satoshis. */
  amountToDeposit: bigint;
  /** The block to read at, the one every read of the same check is pinned to. */
  blockNumber: bigint;
}

/**
 * Whether the application would accept the given vaults into `vaultReceiver`'s
 * position at `blockNumber`. Advisory: the contract reserves nothing, so a
 * `true` can be invalidated by a parameter change or another activation before
 * this batch activates. A failed read throws; callers decide how to fail.
 */
export async function readAllowedToDeposit(
  params: ReadAllowedToDepositParams,
): Promise<boolean> {
  const {
    applicationEntryPoint,
    vaultReceiver,
    nVaultsToDeposit,
    amountToDeposit,
    blockNumber,
  } = params;

  return ethClient.getPublicClient().readContract({
    address: applicationEntryPoint,
    abi: ALLOWED_TO_DEPOSIT_ABI,
    functionName: "allowedToDeposit",
    args: [vaultReceiver, nVaultsToDeposit, amountToDeposit],
    blockNumber,
  });
}
