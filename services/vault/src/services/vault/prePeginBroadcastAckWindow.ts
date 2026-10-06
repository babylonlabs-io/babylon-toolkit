/**
 * Acknowledgment-window gate for a Pre-PegIn broadcast.
 *
 * Both broadcast paths — the inline deposit flow and the resume flow — run
 * this before any wallet probe, signing prompt or device I/O. A Pre-PegIn
 * that does not reach the vault provider's confirmation depth and get
 * acknowledged before `createdAt + pegInAckTimeout` locks BTC into an HTLC
 * that only the refund timelock releases, so a broadcast with less room than
 * the estimated pipeline needs is refused. Every input is a live chain read:
 * the vault's post-finality record from the caller, the head and the
 * parameters here. Any read failure propagates (fail closed, no defaults).
 *
 * Checked before the signing prompt, not again after it: the prompt has no
 * time limit, but the margin is over an hour at any deployed depth, so the
 * residual is the same one the activation path accepts for its prompt.
 *
 * Import this by its own path, never through the `@/services/vault` barrel:
 * that barrel is factory-mocked with a fixed export list in the deposit hook
 * tests (see `ethConfirmationGate.ts`).
 */

import type { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";

import { getProtocolParamsReader } from "@/clients/eth-contract/sdk-readers";
import {
  ackDeadlineBlocksRemaining,
  prePeginBroadcastAckMarginBlocks,
} from "@/utils/ackDeadline";
import { VaultLifecycleStateError } from "@/utils/errors";

import { deadlineHead, readHeadBlock } from "./headBlock";

export interface PrePeginBroadcastAckWindowTarget {
  vaultId: Hex;
  /** Live on-chain status, carried verbatim on the refusal. */
  status: OnChainBtcVaultStatus;
  /** Ethereum block the registration mined at, from the post-finality read. */
  createdAt: bigint;
  /** The vault's stamped version; its `minPrepeginDepth` sizes the margin. */
  offchainParamsVersion: number;
}

/**
 * Refuse unless more than the confirmation-and-pipeline margin remains before
 * the vault's acknowledgment deadline.
 *
 * @throws {VaultLifecycleStateError} `reason: "ack-window-elapsed"`, stage
 *   `"broadcast"`, with the vault's ACTUAL on-chain status.
 * @throws when the head is unreadable, stale, or behind the registration.
 */
export async function assertPrePeginBroadcastAckWindowOpen(
  target: PrePeginBroadcastAckWindowTarget,
): Promise<void> {
  const { vaultId, status, createdAt, offchainParamsVersion } = target;
  const paramsReader = await getProtocolParamsReader();
  const [head, tbvParams, offchainParams] = await Promise.all([
    readHeadBlock(),
    paramsReader.getTBVProtocolParams(),
    paramsReader.getOffchainParamsByVersion(offchainParamsVersion),
  ]);

  // A head behind the registration cannot measure the window at all.
  if (head.number < createdAt) {
    throw new Error(
      `RPC head block ${head.number} is below vault ${vaultId}'s registration block ${createdAt}; the node is behind`,
    );
  }

  const currentBlock = deadlineHead(head);
  const remaining = ackDeadlineBlocksRemaining({
    currentBlock,
    createdAtBlock: createdAt,
    pegInAckTimeout: tbvParams.pegInAckTimeout,
  });
  const margin = prePeginBroadcastAckMarginBlocks(
    offchainParams.minPrepeginDepth,
  );
  if (remaining <= margin) {
    const ackDeadlineBlock = createdAt + tbvParams.pegInAckTimeout;
    throw new VaultLifecycleStateError(
      `Vault ${vaultId} is unlikely to be acknowledged before its deadline at ` +
        `block ${ackDeadlineBlock}: ${remaining} block(s) remain from head ` +
        `${currentBlock}, and confirming and acknowledging the Pre-PegIn is ` +
        `estimated to need ${margin}. Broadcast refused.`,
      {
        reason: "ack-window-elapsed",
        stage: "broadcast",
        role: "target",
        // The ACTUAL on-chain status (PENDING here) — never falsified to EXPIRED.
        status,
        vaultId,
      },
    );
  }
}
