/**
 * Reclaim-PSBT classification and derivation-field augmentation, on the
 * delegated-claim template (`./delegatedClaimPsbt.ts`).
 *
 * Reclaim sweeps the depositor's claim reserve (PegIn output 1) back to
 * P2TR(D). The device signs it standalone, with or without a loaded intent,
 * and tells it apart from Claim by output count alone: same 34-byte
 * `<D> OP_CHECKSIG` leaf, 1 output instead of 2 (dispatch
 * `fw:sign_psbt_validate.c:3781-3783`). It requires ONE TAP_BIP32_DERIVATION
 * entry keyed by D on input 0 (`:2609-2647`); output 0 needs none — the
 * device derives P2TR(D) itself.
 *
 * Firmware citations: `fw:` = LedgerHQ/app-babylon-vault-dev @ `b89dd580`
 * (`develop`, app 0.11.0). Validator: `fw:sign_psbt_validate.c:2524-2708`.
 *
 * Deliberately NOT a validator: the device checks the sequence, sighash,
 * control block, output and fee itself, and a rejection costs no loaded intent.
 *
 * @module ledger-vault-signer/reclaimPsbt
 */
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { assertBip86Path, bip86PathToString } from "./bip86Path";

const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;
const MASTER_FINGERPRINT_HEX_RE = /^[0-9a-f]{8}$/;

/** BIP-341 tapscript leaf version — the only one the device streams (`fw:sign_psbt_validate.c:313`). */
const TAPSCRIPT_LEAF_VERSION = 0xc0;
const X_ONLY_KEY_BYTES = 32;
const OP_PUSHBYTES_32 = 0x20;
const OP_CHECKSIG = 0xac;
const LEAF_KEY_OFFSET = 1;
const LEAF_AFTER_KEY_OFFSET = LEAF_KEY_OFFSET + X_ONLY_KEY_BYTES;
/** `OP_PUSHBYTES_32 ‖ D ‖ OP_CHECKSIG` (`fw:sign_psbt_validate_helpers.c:244`). */
const RECLAIM_LEAF_LEN = LEAF_AFTER_KEY_OFFSET + 1;

const MIN_TX_VERSION = 2;
const TX_LOCKTIME = 0;
/** The device signs one reserve per Reclaim (`fw:sign_psbt_validate.c:2525`). */
const RECLAIM_INPUT_COUNT = 1;
const RECLAIM_OUTPUT_COUNT = 1;
const RECLAIM_SIGN_INPUT_INDEX = 0;

export interface ReclaimPsbtClassification {
  /** UNTWEAKED x-only key D inside the leaf (lowercase hex). */
  readonly leafKeyHex: string;
}

/**
 * Classify a PSBT as a Reclaim from the provider's own parse. Anything else,
 * including hex that does not parse, returns `undefined`, so the caller's
 * ordinary gates keep their error precedence.
 */
export function classifyReclaimPsbt(psbtHex: string): ReclaimPsbtClassification | undefined {
  let psbt: Psbt;
  try {
    psbt = Psbt.fromHex(psbtHex);
  } catch {
    return undefined;
  }
  if (psbt.version < MIN_TX_VERSION || psbt.locktime !== TX_LOCKTIME) return undefined;
  if (psbt.data.inputs.length !== RECLAIM_INPUT_COUNT || psbt.data.outputs.length !== RECLAIM_OUTPUT_COUNT) {
    return undefined;
  }
  const leaves = psbt.data.inputs[RECLAIM_SIGN_INPUT_INDEX].tapLeafScript ?? [];
  if (leaves.length !== 1 || leaves[0].leafVersion !== TAPSCRIPT_LEAF_VERSION) return undefined;
  const script = leaves[0].script;
  if (
    script.length !== RECLAIM_LEAF_LEN ||
    script[0] !== OP_PUSHBYTES_32 ||
    script[LEAF_AFTER_KEY_OFFSET] !== OP_CHECKSIG
  ) {
    return undefined;
  }
  return { leafKeyHex: Buffer.from(script.subarray(LEAF_KEY_OFFSET, LEAF_AFTER_KEY_OFFSET)).toString("hex") };
}

export interface AugmentPsbtForReclaimParams {
  readonly psbtHex: string;
  /** The connected device's depositor x-only key (64 lowercase hex). */
  readonly depositorXOnlyHex: string;
  /** The device's master fingerprint (8 lowercase hex). */
  readonly masterFingerprintHex: string;
  /** The depositor's 5-level BIP-86 path. */
  readonly depositorPath: readonly number[];
}

/**
 * Put the one TAP_BIP32_DERIVATION entry the device requires on input 0:
 * keyed by D, carrying the master fingerprint and the BIP-86 path. Replaces
 * any entry already there. Never touches the unsigned transaction.
 */
export function augmentPsbtForReclaim(params: AugmentPsbtForReclaimParams): string {
  const { psbtHex, depositorXOnlyHex, masterFingerprintHex, depositorPath } = params;
  if (!X_ONLY_HEX_RE.test(depositorXOnlyHex)) {
    throw new Error("depositorXOnlyHex must be 64 lowercase hex characters");
  }
  if (!MASTER_FINGERPRINT_HEX_RE.test(masterFingerprintHex)) {
    throw new Error("masterFingerprintHex must be 8 lowercase hex characters (the 4-byte master fingerprint)");
  }
  assertBip86Path("depositorPath", depositorPath);
  const classified = classifyReclaimPsbt(psbtHex);
  if (classified === undefined) throw new Error("not a Reclaim-shaped PSBT");
  if (classified.leafKeyHex !== depositorXOnlyHex) {
    throw new Error("Reclaim leaf key does not equal the depositor key — this device cannot sign this PSBT");
  }
  const psbt = Psbt.fromHex(psbtHex);
  psbt.data.inputs[RECLAIM_SIGN_INPUT_INDEX].tapBip32Derivation = undefined;
  psbt.updateInput(RECLAIM_SIGN_INPUT_INDEX, {
    tapBip32Derivation: [
      {
        masterFingerprint: Buffer.from(masterFingerprintHex, "hex"),
        pubkey: Buffer.from(depositorXOnlyHex, "hex"),
        path: bip86PathToString(depositorPath),
        leafHashes: [],
      },
    ],
  });
  return psbt.toHex();
}
