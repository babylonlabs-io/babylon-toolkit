/**
 * Ethereum confirmation-depth gate for a peg-in registration.
 *
 * Between `submitPeginRequestBatch` landing on Ethereum and the Pre-PegIn
 * BTC transaction being broadcast there is a reorg window. If the block
 * carrying the registration is orphaned *after* the BTC broadcast, the vault
 * record is gone from the chain while the depositor's BTC is already locked
 * in the HTLC — the deposit is stuck, recoverable only via the HTLC refund
 * leaf after `T_refund` (~3 days). This module closes that window by proving
 * the registration is buried before any BTC is committed.
 *
 * Depth is measured from `BTCVaultBasicInfo.createdAt`, which is the Ethereum
 * **block number** the registration was mined at (see
 * {@link isActivationDeadlinePassedOnChain}, which mirrors the contract's own
 * `block.number > createdAt + pegInActivationTimeout` check). Reading it needs
 * no transaction hash, so the same primitive serves the inline deposit flow
 * and the cross-device resume flow, and every poll re-reads live contract
 * state — an orphaned registration reads back as `depositor === zeroAddress`.
 *
 * Deliberately NOT built on viem's `waitForTransactionReceipt({confirmations})`.
 * That helper fetches the receipt once and thereafter only does block-number
 * arithmetic against the cached copy; it never re-checks that the receipt's
 * block is still canonical, so it resolves happily for a transaction that has
 * been reorged out. It buys a delay, not a finality guarantee.
 *
 * @module services/deposit
 */

import { type Hex, zeroAddress } from "viem";

import type { VaultBasicInfo, VaultRegistryReader } from "../../clients/eth/types";

/**
 * Ethereum block confirmations required before the Pre-PegIn BTC transaction
 * may be broadcast.
 *
 * 8 exceeds the deepest reorg ever observed on Ethereum (7, pre-merge, caused
 * by a client bug), and costs ~1.6 min at 12s slots. Deliberately not the
 * `safe` block tag: a full epoch (~12.8 min) was rejected as too slow for the
 * benefit. This is a liveness guard against an orphaned registration, not a
 * theft mitigation — every Pre-PegIn HTLC spend path requires the depositor's
 * own BTC key regardless.
 */
export const PEGIN_ETH_CONFIRMATIONS = 8;

/** Poll cadence — half an Ethereum slot, so a new block is never missed by long. */
const REGISTRATION_DEPTH_POLL_INTERVAL_MS = 6_000;

/**
 * Overall budget for reaching depth. Nominally ~96s (8 × 12s); the rest
 * absorbs missed slots and RPC lag. Generous on purpose: timing out discards
 * a valid registration that only needed a few more seconds, and the failure is
 * recoverable through the resume flow, so over-waiting is cheaper than
 * under-waiting.
 */
const REGISTRATION_DEPTH_TIMEOUT_MS = 10 * 60_000;

/**
 * Consecutive absent reads tolerated before concluding the registration is
 * genuinely not on-chain. At the 6s cadence this is ~60s — five Ethereum
 * blocks — which is what absorbs a load-balanced pool member still serving
 * pre-block state moments after the receipt. Such a node answers HTTP 200
 * with a validly encoded zero struct, so no transport-level retry can see it;
 * only re-reading later can. Expressed in polls rather than milliseconds so
 * the tolerance scales with the cadence.
 */
const REGISTRATION_ABSENT_GRACE_POLLS = 10;

/**
 * The vault is not registered on-chain, and stayed that way past the grace
 * window — long enough that a lagging backend has been ruled out. Retrying
 * will not help.
 */
export class PeginRegistrationMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeginRegistrationMissingError";
  }
}

/** The registration did not reach the required depth within the budget. */
export class PeginRegistrationNotFinalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeginRegistrationNotFinalError";
  }
}

// `instanceof` alone fails across module boundaries (duplicate SDK copies,
// test mocks). Fall back to the name field, as the other deposit-service
// errors in this directory do.
export function isPeginRegistrationMissingError(
  err: unknown,
): err is PeginRegistrationMissingError {
  return (
    err instanceof PeginRegistrationMissingError ||
    (err instanceof Error && err.name === "PeginRegistrationMissingError")
  );
}

export function isPeginRegistrationNotFinalError(
  err: unknown,
): err is PeginRegistrationNotFinalError {
  return (
    err instanceof PeginRegistrationNotFinalError ||
    (err instanceof Error && err.name === "PeginRegistrationNotFinalError")
  );
}

export interface RegistrationDepthParams {
  /** Current chain tip block number. */
  currentBlock: bigint;
  /** Block number the registration was mined at (`VaultBasicInfo.createdAt`). */
  createdAtBlock: bigint;
}

/**
 * Confirmations accrued by a registration: the mining block counts as the
 * first confirmation, so `tip === createdAt` is 1.
 *
 * Clamped at 0. A reorg between the tip read and the vault read can surface a
 * `createdAt` above the tip already in hand; a negative depth must never
 * propagate into a comparison.
 */
export function computeRegistrationConfirmations(
  params: RegistrationDepthParams,
): number {
  const { currentBlock, createdAtBlock } = params;
  const depth = currentBlock - createdAtBlock + 1n;
  return depth < 0n ? 0 : Number(depth);
}

export interface RegistrationDepthProgress {
  /** Shallowest depth across every vault being waited on. */
  confirmations: number;
  required: number;
}

export interface WaitForPeginRegistrationDepthParams {
  vaultRegistryReader: VaultRegistryReader;
  /**
   * Chain-tip reader. A thunk rather than a `PublicClient` so this module has
   * no viem-client dependency and stays testable with two plain fakes — the
   * same shape `verifyRegisteredVaultVersions` uses for its reader.
   */
  getBlockNumber: () => Promise<bigint>;
  /** Vaults registered by the same transaction; the shallowest one gates. */
  vaultIds: readonly Hex[];
  required?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: RegistrationDepthProgress) => void;
}

export interface PeginRegistrationDepthResult {
  confirmations: number;
  /**
   * The final observation for the shallowest vault. Callers that gated on
   * `status` before the wait should re-assert it against this — the wait can
   * span minutes, and a vault can leave PENDING in that time.
   */
  basicInfo: VaultBasicInfo;
}

/**
 * Poll until every vault's registration is at least `required` blocks deep.
 *
 * A read that comes back empty is treated as "not visible yet", not as
 * "absent": both callers reach this having already proven the registration
 * exists, so an empty read means a lagging RPC backend or a reorg, and both
 * resolve on their own.
 *
 * @throws {PeginRegistrationMissingError} if no vault has ever been observed and the grace window is spent.
 * @throws {PeginRegistrationNotFinalError} on timeout.
 * @throws if aborted.
 */
export async function waitForPeginRegistrationDepth(
  params: WaitForPeginRegistrationDepthParams,
): Promise<PeginRegistrationDepthResult> {
  const {
    vaultRegistryReader,
    getBlockNumber,
    vaultIds,
    required = PEGIN_ETH_CONFIRMATIONS,
    pollIntervalMs = REGISTRATION_DEPTH_POLL_INTERVAL_MS,
    timeoutMs = REGISTRATION_DEPTH_TIMEOUT_MS,
    signal,
    onProgress,
  } = params;

  if (vaultIds.length === 0) {
    throw new Error(
      "waitForPeginRegistrationDepth requires at least one vault ID",
    );
  }

  const startTime = Date.now();
  // Once any poll has seen the registration, a later disappearance is a reorg,
  // and re-inclusion is the expected outcome — that case polls to the full
  // budget. Before the first sighting, absence is far more likely to be a
  // lagging backend than a missing registration, so it gets a grace window.
  let hasObservedRegistration = false;
  let absentPolls = 0;
  let lastError: unknown;

  while (true) {
    if (signal?.aborted) {
      throw new Error(
        `Aborted while waiting for peg-in registration depth (${vaultIds.length} vault(s))`,
      );
    }

    if (Date.now() - startTime >= timeoutMs) {
      // Deliberately avoids the word "broadcast". Callers classify this by
      // type, but any surface that stringifies it would otherwise land in the
      // message-matching "broadcast failed" bucket and tell the user the exact
      // opposite of what happened.
      throw new PeginRegistrationNotFinalError(
        `Peg-in registration did not reach ${required} Ethereum confirmations within ${timeoutMs}ms. ` +
          `The registration transaction was submitted but is not yet final, so the Pre-PegIn ` +
          `Bitcoin transaction was never sent and no funds are at risk. ` +
          `Resume this deposit from the dashboard once the network settles.` +
          (lastError instanceof Error ? ` Last read error: ${lastError.message}` : ""),
      );
    }

    try {
      // Tip FIRST, vault state SECOND. Both read `latest`, but they are two
      // round-trips: reading the tip first means it can only be at or behind
      // the state the vault read observes, so the computed depth is an
      // under-estimate. Reversing the order could over-count by a block and
      // release the broadcast at 7 confirmations.
      //
      // That ordering only guarantees the under-count when both land on the
      // same backend. Against a load-balanced pool the tip can come from an
      // ahead node and the vault from a behind one — the same root cause as
      // the empty-read handling below, and why this is a best-effort skew
      // guard rather than a proof.
      const currentBlock = await getBlockNumber();
      const infos = await Promise.all(
        vaultIds.map((vaultId) => vaultRegistryReader.getVaultBasicInfo(vaultId)),
      );

      // A zero record is what an orphaned (or never-included) registration
      // reads back as. `createdAt === 0n` is checked alongside the zero
      // depositor because a partially-decoded record must never be treated as
      // block 0 — that would compute as infinitely deep and pass the gate.
      const missingIndex = infos.findIndex(
        (info) => info.depositor === zeroAddress || info.createdAt === 0n,
      );

      if (missingIndex !== -1) {
        absentPolls += 1;

        // Never seen it, and the grace window is spent: a lagging backend has
        // been ruled out, so the registration really is not there. Only ever
        // reachable for a caller that supplied a vault ID which was never
        // registered — both in-repo callers arrive here having already proven
        // the vault visible (a receipt inline, a throwing `getVaultFromChain`
        // on resume).
        if (
          !hasObservedRegistration &&
          absentPolls > REGISTRATION_ABSENT_GRACE_POLLS
        ) {
          throw new PeginRegistrationMissingError(
            `Vault ${vaultIds[missingIndex]} is still not visible on-chain after ` +
              `${absentPolls} reads — the registration does not exist.`,
          );
        }

        // Otherwise keep polling. Before the first sighting this is almost
        // always an RPC backend that has not caught up to the registration
        // block; after one, it is the reorg this gate exists for, where
        // re-inclusion within a block or two is the expected outcome. Both
        // resolve themselves, and both would be made worse by aborting a
        // deposit that is about to be fine.
        console.warn(
          `Peg-in registration for vault ${vaultIds[missingIndex]} is not visible in chain state ` +
            `at block ${currentBlock} — a lagging RPC backend or an Ethereum reorg. Still polling.`,
        );
        onProgress?.({ confirmations: 0, required });
      } else {
        hasObservedRegistration = true;
        absentPolls = 0;
        lastError = undefined;

        // The shallowest vault gates the batch: they share one registration
        // transaction, so in practice the depths are equal, but taking the
        // minimum is the fail-safe reading if they ever diverge.
        let shallowest = infos[0];
        let shallowestDepth = computeRegistrationConfirmations({
          currentBlock,
          createdAtBlock: infos[0].createdAt,
        });
        for (const info of infos.slice(1)) {
          const depth = computeRegistrationConfirmations({
            currentBlock,
            createdAtBlock: info.createdAt,
          });
          if (depth < shallowestDepth) {
            shallowestDepth = depth;
            shallowest = info;
          }
        }

        onProgress?.({ confirmations: shallowestDepth, required });

        if (shallowestDepth >= required) {
          return { confirmations: shallowestDepth, basicInfo: shallowest };
        }
      }
    } catch (error) {
      if (isPeginRegistrationMissingError(error)) {
        throw error;
      }
      // Transient RPC failure. Retry on the next tick; the outer timeout owns
      // the overall budget, so one blip must not consume it.
      console.warn(
        `Registration-depth read failed (retrying in ${pollIntervalMs}ms): ` +
          (error instanceof Error ? error.message : String(error)),
      );
      lastError = error;
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `Aborted while waiting for peg-in registration depth (${vaultIds.length} vault(s))`,
          ),
        );
      };
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, pollIntervalMs);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
