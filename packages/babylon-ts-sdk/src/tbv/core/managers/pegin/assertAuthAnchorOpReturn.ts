/**
 * Structural verifier for the auth-anchor OP_RETURN in a funded
 * Pre-PegIn transaction.
 *
 * @module managers/pegin/assertAuthAnchorOpReturn
 */

import * as bitcoin from "bitcoinjs-lib";

import { stripHexPrefix } from "../../primitives/utils/bitcoin";

/** OP_RETURN opcode. */
const OP_RETURN = 0x6a;
/** Push-32-bytes opcode (raw push, not OP_PUSHDATA1). */
const OP_PUSH32 = 0x20;
/** Encoded length of a standard OP_RETURN script with a 32-byte payload. */
const OP_RETURN_PUSH32_SCRIPT_LEN = 1 + 1 + 32;

/**
 * Verify the broadcast Pre-PegIn carries the expected OP_RETURN
 * commitment to the auth anchor.
 *
 * The OP_RETURN sits at `vout = vaultCount` (right after the per-vault
 * HTLC outputs and before the depositor-claim/change outputs) and
 * pushes the 32-byte `SHA256(authAnchor)`. The script encoding is
 * exactly `OP_RETURN || PUSH32 || <32 bytes>` (34 bytes). A
 * non-conformant WASM build that omitted the OP_RETURN, swapped its
 * position, or changed its push payload would let the depositor
 * obtain a valid bearer token for a Pre-PegIn whose on-chain
 * commitment doesn't actually bind the anchor — degrading the auth
 * from on-chain-bound to a shared secret. Fail closed.
 *
 * @throws If the OP_RETURN is missing, mis-located, mis-encoded, or
 *         pushes a payload other than `expectedAuthAnchorHashHex`.
 */
export function assertAuthAnchorOpReturn(
  fundedPrePeginTxHex: string,
  vaultCount: number,
  expectedAuthAnchorHashHex: string,
): void {
  const cleanHex = stripHexPrefix(fundedPrePeginTxHex);
  const tx = bitcoin.Transaction.fromHex(cleanHex);

  if (tx.outs.length <= vaultCount) {
    throw new Error(
      `Pre-PegIn auth-anchor OP_RETURN missing: tx has ${tx.outs.length} ` +
        `outputs, expected at least ${vaultCount + 1} (vault outputs + OP_RETURN)`,
    );
  }

  const opReturnOutput = tx.outs[vaultCount];
  const script = opReturnOutput.script;
  if (
    script.length !== OP_RETURN_PUSH32_SCRIPT_LEN ||
    script[0] !== OP_RETURN ||
    script[1] !== OP_PUSH32
  ) {
    throw new Error(
      `Pre-PegIn auth-anchor OP_RETURN at vout ${vaultCount} has unexpected ` +
        `script encoding (got ${script.length}-byte script with prefix ` +
        `0x${script.slice(0, Math.min(2, script.length)).toString("hex")}; ` +
        `expected ${OP_RETURN_PUSH32_SCRIPT_LEN}-byte OP_RETURN + PUSH32 layout)`,
    );
  }

  const pushedHex = script.slice(2).toString("hex").toLowerCase();
  if (pushedHex !== expectedAuthAnchorHashHex.toLowerCase()) {
    throw new Error(
      `Pre-PegIn auth-anchor OP_RETURN payload mismatch at vout ${vaultCount}: ` +
        `tx pushes ${pushedHex}, expected ${expectedAuthAnchorHashHex}`,
    );
  }

  if (opReturnOutput.value !== 0) {
    throw new Error(
      `Pre-PegIn auth-anchor OP_RETURN at vout ${vaultCount} has non-zero ` +
        `value ${opReturnOutput.value}; OP_RETURN outputs must be 0-value`,
    );
  }
}

/**
 * Read the auth-anchor OP_RETURN payload at the fixed index `vout` of a
 * funded Pre-PegIn transaction.
 *
 * Positional, matching the protocol: the auth anchor — when present — sits
 * at `vout = htlcCount` (see {@link countHtlcOutputs}). Mirrors btc-vault
 * `PrePegInTx::extract_auth_anchor_hash`:
 *  - returns `undefined` when the output at `vout` is absent or is not an
 *    OP_RETURN (no auth anchor — a legitimate shape);
 *  - returns the 32-byte payload as lowercase hex when the output is a
 *    well-formed `OP_RETURN || PUSH32 || <32 bytes>`;
 *  - throws when the output IS an OP_RETURN but malformed — that must not
 *    silently collapse to "no anchor".
 *
 * @throws If `vout`'s output is an OP_RETURN that is not a clean 32-byte push.
 */
export function readAuthAnchorOpReturn(
  fundedPrePeginTxHex: string,
  vout: number,
): string | undefined {
  const tx = bitcoin.Transaction.fromHex(stripHexPrefix(fundedPrePeginTxHex));

  const output = tx.outs[vout];
  if (output === undefined) return undefined;

  const script = output.script;
  // Not an OP_RETURN → no auth anchor at this position (legitimate).
  if (script.length === 0 || script[0] !== OP_RETURN) return undefined;

  // It IS an OP_RETURN — it must be the canonical 32-byte push, or throw.
  if (script.length !== OP_RETURN_PUSH32_SCRIPT_LEN || script[1] !== OP_PUSH32) {
    throw new Error(
      `Auth-anchor OP_RETURN at vout ${vout} is malformed: expected ` +
        `${OP_RETURN_PUSH32_SCRIPT_LEN}-byte OP_RETURN + PUSH32 layout, got a ` +
        `${script.length}-byte script`,
    );
  }
  return script.slice(2).toString("hex").toLowerCase();
}

/**
 * Count the HTLC outputs at the head of a funded Pre-PegIn transaction.
 *
 * Mirrors btc-vault `PrePegInTx::count_htlc_outputs` and the contract's
 * `PeginLogic._countHtlcOutputs`: the HTLC outputs are the contiguous
 * leading outputs before the first OP_RETURN; the optional auth-anchor
 * OP_RETURN sits right after them, and the CPFP anchor is always the last
 * output. Walks outputs `[0, len - 1)` (the last is the CPFP anchor) and
 * stops at the first OP_RETURN.
 *
 * The returned count doubles as the auth-anchor index for
 * {@link readAuthAnchorOpReturn}.
 *
 * Caveat (same as btc-vault's): for a Pre-PegIn with no auth-anchor
 * OP_RETURN, a wallet-appended output after the CPFP anchor inflates the
 * count — it is an upper bound. The refund's `count !== 1` check then fails
 * closed (refuses), which is safe.
 *
 * @throws If the transaction has fewer than 2 outputs.
 */
export function countHtlcOutputs(fundedPrePeginTxHex: string): number {
  const tx = bitcoin.Transaction.fromHex(stripHexPrefix(fundedPrePeginTxHex));

  if (tx.outs.length < 2) {
    throw new Error(
      `Funded Pre-PegIn must have at least 2 outputs (HTLC + CPFP anchor), ` +
        `got ${tx.outs.length}`,
    );
  }

  let count = 0;
  for (let i = 0; i < tx.outs.length - 1; i++) {
    if (tx.outs[i].script[0] === OP_RETURN) break;
    count++;
  }
  return count;
}
