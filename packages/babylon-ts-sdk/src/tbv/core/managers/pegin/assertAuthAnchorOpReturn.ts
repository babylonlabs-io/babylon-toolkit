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
