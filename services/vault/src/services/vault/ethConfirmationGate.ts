/**
 * App-side binding for the SDK's peg-in registration finality gate.
 *
 * Both Pre-PegIn broadcast paths — the inline deposit flow and the resume /
 * cross-device flow — must prove the Ethereum registration is buried
 * deep enough before any BTC is committed to the HTLC (the required depth is
 * the SDK's `PEGIN_ETH_CONFIRMATIONS`). This module supplies the two chain readers the SDK primitive
 * needs so neither call site has to.
 *
 * Import this by its own path, never through the `@/services/vault` barrel:
 * that barrel is factory-mocked with a fixed export list in the deposit hook
 * tests, and a new barrel export would break them for reasons unrelated to
 * what they assert.
 */

import {
  isPeginRegistrationFinal,
  waitForPeginRegistrationDepth,
  type PeginRegistrationDepthResult,
  type RegistrationDepthProgress,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Hex } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";

export type { RegistrationDepthProgress };

export interface WaitForEthRegistrationDepthParams {
  /** Every vault registered by the same ETH transaction; the shallowest gates. */
  vaultIds: readonly Hex[];
  onProgress?: (progress: RegistrationDepthProgress) => void;
  signal?: AbortSignal;
}

/**
 * Block until the peg-in registration for `vaultIds` is final.
 *
 * @throws {PeginRegistrationMissingError} the vault is not registered on-chain.
 * @throws {PeginRegistrationNotFinalError} the depth was not reached in budget.
 */
export async function waitForEthRegistrationDepth(
  params: WaitForEthRegistrationDepthParams,
): Promise<PeginRegistrationDepthResult> {
  const { vaultIds, onProgress, signal } = params;

  return waitForPeginRegistrationDepth({
    vaultRegistryReader: getVaultRegistryReader(),
    getBlockNumber: () => ethClient.getPublicClient().getBlockNumber(),
    vaultIds,
    onProgress,
    signal,
  });
}

/**
 * Cheap pre-check for a `createdAt` already in hand.
 *
 * The resume path reads the vault before it reaches the gate, so any deposit
 * registered more than ~2 minutes ago short-circuits here — no extra contract
 * read, no poll loop, and no confirmation panel flashing on screen for a
 * deposit that has been final for hours.
 */
export async function isEthRegistrationFinal(
  createdAtBlock: bigint,
): Promise<boolean> {
  const currentBlock = await ethClient.getPublicClient().getBlockNumber();
  return isPeginRegistrationFinal({ currentBlock, createdAtBlock });
}
