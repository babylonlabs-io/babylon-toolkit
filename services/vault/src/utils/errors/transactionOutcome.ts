import type { Address, Hash, Hex } from "viem";

import { COPY } from "@/copy";

import { chainMatchesFrame } from "./causeChain";
import { classifyError } from "./formatting";
import { ContractError, ErrorCode } from "./types";

/** A broadcast transaction: enough to keep waiting on it and to recognize a replacement. */
export interface BroadcastTransaction {
  hash: Hash;
  /** The account that sent it, which is also the account a replacement comes from. */
  from: Address;
  to: Address;
  data: Hex;
}

/**
 * A broadcast transaction whose receipt wait ended without an answer, with
 * what the app's RPC said about it right after the send. Read then, because a
 * wallet replacement drops the original from the node's pool, after which the
 * nonce cannot be learned from its hash.
 */
export interface UnconfirmedBroadcast extends BroadcastTransaction {
  /** The sent transaction's nonce. Null when the RPC did not serve it in time; a Safe proposal hash is never served. */
  nonce: number | null;
  /** The latest block when the transaction was sent: a block where its nonce was not yet used. */
  sentAtBlock: bigint | null;
}

/**
 * The transaction was broadcast, but the wait for its receipt ended without an
 * answer: viem's receipt timeout ran out, or the RPC failed while polling. It
 * can still be mined, so the caller must not report a failure or offer the
 * same action again until the outcome is known (`services/vault/
 * SECURITY_MODEL.md`, property 10). The message is the mapped original, kept
 * for the log.
 */
export class UnconfirmedTransactionError extends ContractError {
  readonly broadcast: UnconfirmedBroadcast;

  constructor(mapped: ContractError, broadcast: UnconfirmedBroadcast) {
    super(mapped.message, mapped.code, broadcast.hash, mapped.reason, {
      cause: mapped.cause,
      context: mapped.context,
    });
    this.name = "UnconfirmedTransactionError";
    this.broadcast = broadcast;
  }
}

/**
 * Another transaction from the same account used the broadcast transaction's
 * nonce, so the broadcast one can never be mined. `not-executed`: the
 * replacement was a cancel or a different call. `unknown`: the nonce was used,
 * but the replacement could not be read, so it may have been a speed-up of the
 * same call.
 */
export class TransactionReplacedError extends ContractError {
  readonly outcome: "not-executed" | "unknown";

  constructor(outcome: "not-executed" | "unknown", hash: Hash) {
    super(
      outcome === "not-executed"
        ? COPY.common.unconfirmedTransaction.replaced
        : COPY.common.unconfirmedTransaction.replacedOutcomeUnknown,
      ErrorCode.CONTRACT_EXECUTION_FAILED,
      hash,
    );
    this.name = "TransactionReplacedError";
    this.outcome = outcome;
  }
}

/**
 * Refusal before signing: the app's RPC counts more transactions from the
 * account at `pending` than at `latest`, so one is still waiting to be mined.
 * Nothing was signed or sent.
 */
export class TransactionInFlightError extends ContractError {
  constructor() {
    super(COPY.common.transactionInFlight, ErrorCode.CONTRACT_NONCE_ERROR);
    this.name = "TransactionInFlightError";
  }
}

/**
 * Refusal before signing: another Aave write from the same account holds the
 * app's in-memory lock. Nothing was signed or sent.
 */
export class WriteInProgressError extends ContractError {
  constructor() {
    super(COPY.common.unconfirmedTransaction.inProgress);
    this.name = "WriteInProgressError";
  }
}

/**
 * True for an outcome that is not a failure and must not be shown as one: a
 * refusal before anything was signed, or a replacement that may have done the
 * same call.
 */
export function isWriteNotice(error: unknown): error is ContractError {
  return (
    error instanceof TransactionInFlightError ||
    error instanceof WriteInProgressError ||
    (error instanceof TransactionReplacedError && error.outcome === "unknown")
  );
}

/**
 * viem rejects a receipt wait with these when an RPC backend lags behind the
 * one that answered before it: the block, the transaction or the replacement's
 * receipt is not served yet (viem 2.38.2
 * `actions/public/waitForTransactionReceipt.ts`).
 */
const LAGGING_RPC_ERROR_NAMES = new Set([
  "BlockNotFoundError",
  "TransactionNotFoundError",
  "TransactionReceiptNotFoundError",
]);

/**
 * Safe Transaction Service answers that a later poll can get past, in the
 * plain `Error` text the SDK's smart-account-aware wait throws for them
 * (`packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts`):
 * a rate limit or request timeout, and its own deadline for a proposal still
 * waiting for co-signers in the Safe queue. A test pins the text to the SDK's
 * output; a reworded message only offers "Stop waiting" sooner.
 */
const SAFE_SERVICE_TRANSIENT_PATTERN =
  /Safe Transaction Service returned (?:408|429)\b|still pending in the Safe queue/;

/**
 * True when a later round of the receipt wait can answer what this one could
 * not: the wait timed out, the RPC failed or lagged, or the Safe Transaction
 * Service rate-limited the request or the proposal is still in its queue.
 * Other inconclusive errors, such as the service refusing the request
 * outright, will come back the same way.
 */
export function isTransientReceiptWaitError(error: unknown): boolean {
  const kind = classifyError(error);
  if (
    kind === "receipt-timeout" ||
    kind === "network" ||
    kind === "rpc-error"
  ) {
    return true;
  }
  return chainMatchesFrame(
    error,
    (frame) =>
      frame instanceof Error &&
      (LAGGING_RPC_ERROR_NAMES.has(frame.name) ||
        SAFE_SERVICE_TRANSIENT_PATTERN.test(frame.message)),
  );
}

/**
 * The SDK's smart-account-aware wait reports a Safe transaction that executed
 * and reverted with a plain `Error` carrying this text
 * (`packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts`).
 * A typed SDK error is a declared follow-up. Until then this text is the only
 * way to tell that answer apart, and a test pins it to the SDK's own output. A
 * reworded message makes the outcome unconfirmed, the safe direction.
 */
const SAFE_EXECUTION_REVERTED_TEXT = "was executed on chain but reverted";

/**
 * True only when a failed receipt wait is itself the answer: the transaction
 * executed and failed. Every other failure after the broadcast leaves the
 * outcome unknown, including Safe Transaction Service errors and its timeout
 * while a proposal is still pending in the Safe queue, so the caller must keep
 * the transaction unconfirmed rather than report it failed.
 */
export function isDefinitiveReceiptWaitFailure(error: unknown): boolean {
  return chainMatchesFrame(
    error,
    (frame) =>
      frame instanceof Error &&
      frame.message.includes(SAFE_EXECUTION_REVERTED_TEXT),
  );
}
