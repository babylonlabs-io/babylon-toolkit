/**
 * Count a Pre-PegIn's HTLC outputs exactly as the registry does when it
 * validates a registration's `htlcVout`: `_countHtlcOutputs`
 * (vault-contracts-aave-v4@06f46477:src/protocol/lib/PeginLogic.sol:543-555),
 * applied at
 * vault-contracts-aave-v4@06f46477:src/protocol/lib/PeginLogic.sol:281-283.
 * Layout: HTLC outputs at [0..N-1], the auth-anchor OP_RETURN at N (every
 * current build asserts it, `assertAuthAnchorOpReturn`), then the remaining
 * outputs — the change output, when there is one, is appended last by
 * `fundPeginTransaction`. For that layout the count is N. It always equals the
 * registry's own count, and so the number of outputs a vault can be
 * registered at. Without the anchor it can differ from the transaction's real
 * HTLCs either way: trailing outputs before the last are counted, and a final
 * HTLC with nothing after it is not — the registry rejects a vault there too.
 *
 * Import this by its own path: the `@/utils/btc` barrel is factory-mocked
 * with a fixed export list in some deposit hook tests.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { opcodes, Transaction } from "bitcoinjs-lib";

/**
 * The registry never counts the last output as an HTLC, so it finds no HTLC
 * in a transaction with fewer outputs than this.
 */
const MIN_PRE_PEGIN_OUTPUT_COUNT = 2;

/**
 * Number of leading outputs before the first OP_RETURN, never counting the
 * last output. Returns 0 where the registry would (too few outputs, or an
 * OP_RETURN first); callers decide whether that is acceptable.
 *
 * @throws if `txHex` is not a parseable Bitcoin transaction.
 */
export function countPrePeginHtlcOutputs(txHex: string): number {
  const { outs } = Transaction.fromHex(stripHexPrefix(txHex));
  if (outs.length < MIN_PRE_PEGIN_OUTPUT_COUNT) return 0;

  const lastOutputIndex = outs.length - 1;
  let count = 0;
  for (let i = 0; i < lastOutputIndex; i++) {
    const { script } = outs[i];
    if (script.length > 0 && script[0] === opcodes.OP_RETURN) break;
    count++;
  }
  return count;
}
