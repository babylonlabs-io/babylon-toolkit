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
 * parameters here. A read that fails or cannot be trusted fails closed with
 * no verdict (`broadcastAckWindowUnavailable`), never a default.
 *
 * Checked before the signing prompt, not again after it: the prompt has no
 * time limit, but the margin is 85 minutes at the daemon's floor depth of 6
 * (btc-vault `docs/specifications/pegin.md`, deployment parameters), so the
 * residual is the same one the activation path accepts for its prompt.
 *
 * Import this by its own path, never through the `@/services/vault` barrel:
 * that barrel is factory-mocked with a fixed export list in the deposit hook
 * tests (see `ethConfirmationGate.ts`).
 */

import type { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";

import { getProtocolParamsReader } from "@/clients/eth-contract/sdk-readers";
import { COPY } from "@/copy";
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
 * A chain read failed or cannot be trusted, so the window has no verdict.
 * The depositor sees the copy; the node's own words stay on `cause` for the
 * log. Same shape as the activation gate's `onDeadlineReadFailure`.
 */
function windowUnavailable(cause: unknown): never {
  throw new Error(COPY.deposit.errors.broadcastAckWindowUnavailable.body, {
    cause,
  });
}

/**
 * Refuse unless more than the confirmation-and-pipeline margin remains before
 * the vault's acknowledgment deadline.
 *
 * @throws {VaultLifecycleStateError} `reason: "ack-window-elapsed"`, stage
 *   `"broadcast"`, with the vault's ACTUAL on-chain status.
 * @throws {Error} `broadcastAckWindowUnavailable` when the head is
 *   unreadable, stale, behind the registration, or a parameter read fails.
 */
export async function assertPrePeginBroadcastAckWindowOpen(
  target: PrePeginBroadcastAckWindowTarget,
): Promise<void> {
  const { vaultId, status, createdAt, offchainParamsVersion } = target;
  const paramsReader = await getProtocolParamsReader().catch(windowUnavailable);
  const [head, tbvParams, offchainParams] = await Promise.all([
    readHeadBlock(),
    paramsReader.getTBVProtocolParams(),
    paramsReader.getOffchainParamsByVersion(offchainParamsVersion),
  ]).catch(windowUnavailable);

  // A head behind the registration cannot measure the window at all.
  if (head.number < createdAt) {
    windowUnavailable(
      new Error(
        `RPC head block ${head.number} is below vault ${vaultId}'s registration block ${createdAt}; the node is behind`,
      ),
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
