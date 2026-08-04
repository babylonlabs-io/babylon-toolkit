/**
 * Standard-scriptPubKey validation for registry-supplied payout destinations.
 *
 * RFC-006 lets an operator register an arbitrary payout scriptPubKey, so the
 * bytes we pin a `PayoutTx` output against are now chosen by that operator
 * rather than derived by us. Pinning an output to them without checking the
 * shape would let a keeper that registered a garbage or unspendable script get
 * the depositor to pre-sign a payout nobody can ever claim.
 *
 * The registry accepts anything; the protocol only makes sense for outputs
 * that are spendable and representable as an address, which is the same gate
 * `vaultd` applies before it will build a graph.
 *
 * @module primitives/psbt/standardPayoutScript
 */

import { stripHexPrefix } from "../utils/bitcoin";

/** `OP_0 <20>` — P2WPKH. */
const P2WPKH_LEN = 22;
/** `OP_0 <32>` — P2WSH. */
const P2WSH_LEN = 34;
/** `OP_1 <32>` — P2TR. */
const P2TR_LEN = 34;
/** `OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG` — P2PKH. */
const P2PKH_LEN = 25;
/** `OP_HASH160 <20> OP_EQUAL` — P2SH. */
const P2SH_LEN = 23;

function isP2wpkh(s: string): boolean {
  return s.length === P2WPKH_LEN * 2 && s.startsWith("0014");
}
function isP2wsh(s: string): boolean {
  return s.length === P2WSH_LEN * 2 && s.startsWith("0020");
}
function isP2tr(s: string): boolean {
  return s.length === P2TR_LEN * 2 && s.startsWith("5120");
}
function isP2pkh(s: string): boolean {
  return (
    s.length === P2PKH_LEN * 2 && s.startsWith("76a914") && s.endsWith("88ac")
  );
}
function isP2sh(s: string): boolean {
  return s.length === P2SH_LEN * 2 && s.startsWith("a914") && s.endsWith("87");
}

/**
 * Assert a registry-supplied scriptPubKey is a standard, spendable output type
 * (P2TR, P2WPKH, P2WSH, P2PKH, or P2SH).
 *
 * Rejects empty scripts, `OP_RETURN` (provably unspendable), and anything else
 * that is not one of the five standard forms. `label` names the source in the
 * error, e.g. `vault keeper payout script (admin=0x…)`.
 */
export function assertStandardPayoutScript(
  scriptHex: string,
  label: string,
): void {
  const script = stripHexPrefix(scriptHex).toLowerCase();

  if (script.length === 0) {
    throw new Error(`${label} is empty`);
  }
  if (!/^[0-9a-f]+$/.test(script) || script.length % 2 !== 0) {
    throw new Error(`${label} is not valid hex`);
  }
  if (script.startsWith("6a")) {
    throw new Error(
      `${label} is an OP_RETURN output, which is provably unspendable`,
    );
  }

  if (
    !isP2tr(script) &&
    !isP2wpkh(script) &&
    !isP2wsh(script) &&
    !isP2pkh(script) &&
    !isP2sh(script)
  ) {
    throw new Error(
      `${label} is not a standard scriptPubKey ` +
        `(expected P2TR, P2WPKH, P2WSH, P2PKH, or P2SH; got ${script.length / 2} bytes: ${script})`,
    );
  }
}
