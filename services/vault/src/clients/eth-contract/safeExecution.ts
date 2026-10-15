/**
 * A Safe wallet's write is mined inside an executor's `execTransaction`. That
 * outer transaction can succeed while the Safe's own call fails: the Safe logs
 * the failure for the proposal instead of reverting (always in v1.0.0 and
 * v1.1.1; in v1.3.0 and v1.4.1 when `safeTxGas` or `gasPrice` is non-zero). The
 * SDK takes the Safe Transaction Service's `isSuccessful` before it returns the
 * first receipt, but that answer is about the chain the service indexed then;
 * once a reorganization mines the execution again, the inner call can end
 * differently. So the receipt accepted at depth is read for the Safe's own
 * verdict on the proposal.
 *
 * The logs, in the safe-global/safe-smart-account releases checked:
 *   - v1.1.1, v1.3.0, v1.4.1: `ExecutionSuccess(bytes32,uint256)` or
 *     `ExecutionFailure(bytes32,uint256)`, the proposal hash indexed in v1.4.1
 *     and the first data word in the others;
 *   - v1.0.0: `ExecutionFailed(bytes32)` on failure, the proposal hash in the
 *     data, and nothing on success.
 */

import {
  size,
  slice,
  toEventSelector,
  type Address,
  type Hash,
  type Hex,
  type Log,
  type TransactionReceipt,
} from "viem";

const EXECUTION_SUCCESS_TOPIC = toEventSelector(
  "ExecutionSuccess(bytes32,uint256)",
);
const EXECUTION_FAILURE_TOPICS = new Set<string>([
  toEventSelector("ExecutionFailure(bytes32,uint256)"),
  // Safe v1.0.0's only execution log.
  toEventSelector("ExecutionFailed(bytes32)"),
]);

/** Bytes in the proposal hash, the event's first argument. */
const PROPOSAL_HASH_BYTES = 32;

/**
 * The Safe's verdict on one write in a receipt. `none`: the receipt holds no
 * execution log from that Safe, so its own status decides (an ordinary
 * wallet's transaction, or a v1.0.0 Safe's successful execution). `unknown`:
 * it is a proposal's execution and holds one, but not for this proposal.
 */
export type SafeExecution = "succeeded" | "failed" | "unknown" | "none";

/**
 * The proposal hash an execution log names. Safe versions differ on whether
 * it is indexed, so it is either the second topic or the first data word.
 */
function executedProposal(log: Log): Hex | null {
  const indexed = log.topics[1];
  if (indexed) return indexed;
  if (size(log.data) < PROPOSAL_HASH_BYTES) return null;
  return slice(log.data, 0, PROPOSAL_HASH_BYTES);
}

/**
 * Whether a receipt is a Safe proposal's execution: a transaction another
 * account sent, under another hash than the one the wallet returned. A wallet
 * that sent its own transaction returned that transaction's hash. This cannot
 * tell a proposal's execution from a speed-up another account sent of the
 * wallet's own transaction (a Safe owner's, or a relayer's), so such a
 * speed-up is held as unconfirmed rather than judged.
 */
export function isProposalExecution(
  receipt: TransactionReceipt,
  account: Address,
  sentHash: Hash,
): boolean {
  return (
    receipt.transactionHash.toLowerCase() !== sentHash.toLowerCase() &&
    receipt.from.toLowerCase() !== account.toLowerCase()
  );
}

/**
 * The Safe's verdict on the write the wallet answered with `sentHash`, from
 * the execution log the Safe at `safe` emitted in a receipt. For a proposal's
 * execution, the log must name that proposal. When the receipt is the
 * wallet's own transaction, `sentHash` is not a proposal hash, and the
 * execution the Safe logged in it is this write's.
 */
export function readSafeExecution(
  receipt: TransactionReceipt,
  safe: Address,
  sentHash: Hash,
): SafeExecution {
  const ownTransaction = !isProposalExecution(receipt, safe, sentHash);
  let sawExecution = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== safe.toLowerCase()) continue;
    const topic = log.topics[0]?.toLowerCase();
    if (topic === undefined) continue;
    const succeeded = topic === EXECUTION_SUCCESS_TOPIC;
    if (!succeeded && !EXECUTION_FAILURE_TOPICS.has(topic)) continue;
    sawExecution = true;
    if (
      ownTransaction ||
      executedProposal(log)?.toLowerCase() === sentHash.toLowerCase()
    ) {
      return succeeded ? "succeeded" : "failed";
    }
  }
  return sawExecution ? "unknown" : "none";
}
