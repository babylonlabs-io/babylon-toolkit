/**
 * Refund-PSBT classification and derivation-field augmentation (#2371).
 *
 * The device signs a standalone refund from ANY vault state — the intent
 * requirement is host-side only — but it demands two TAP_BIP32_DERIVATION
 * entries the SDK builder does not set, keyed ASYMMETRICALLY: input 0 by the
 * untweaked depositor key inside the refund leaf (derived and compared
 * directly), output 0 by the BIP-86 TWEAKED key — the scriptPubKey's witness
 * program (derived, tweaked, then compared).
 *
 * Firmware citations: `fw:` = LedgerHQ/app-babylon-vault @ `ff1e1ce17`
 * (`fix/feedback`, v0.10.0). Leaf grammar: `fw:sign_psbt_validate_helpers.c:77-148`
 * (`parse_refund_leaf_script`); input entry: `fw:sign_psbt_validate.c:905-950`;
 * output entry: `fw:sign_psbt_validate.c:1005-1057`; both entries are REQUIRED —
 * a missing lookup rejects with SW_INCORRECT_DATA.
 *
 * @module ledger-vault-signer/refundPsbt
 */
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { assertBip86Path, bip86PathToString } from "./bip86Path";
import { DEVICE_TIMELOCK_MIN_BLOCKS } from "./deviceCaps";

const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;
const MASTER_FINGERPRINT_HEX_RE = /^[0-9a-f]{8}$/;

/** BIP-341 tapscript leaf version — the only one the vault builders emit. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;
const X_ONLY_KEY_BYTES = 32;

// Script opcodes the firmware parser dispatches on
// (`fw:sign_psbt_validate_helpers.c:104-139`).
const OP_0 = 0x00;
const OP_PUSHBYTES_1 = 0x01;
const OP_PUSHBYTES_32 = 0x20;
const OP_PUSHBYTES_75 = 0x4b;
const OP_PUSHDATA1 = 0x4c;
const OP_1NEGATE = 0x4f;
const OP_RESERVED = 0x50;
const OP_1 = 0x51;
const OP_16 = 0x60;
const OP_CHECKSIGVERIFY = 0xad;
const OP_CHECKSEQUENCEVERIFY = 0xb2;

/** CScriptNum caps, per the firmware (`fw:sign_psbt_validate_helpers.c:28-30`). */
const SCRIPT_NUM_MAX_LEN = 4;
const SCRIPT_NUM_SIGN_BIT = 0x80;

/** `OP_PUSHBYTES_32 ‖ key(32) ‖ OP_CHECKSIGVERIFY ‖ push(1) ‖ OP_CSV` (`fw:…helpers.c:33-34`). */
const REFUND_SCRIPT_MIN_LEN = 1 + X_ONLY_KEY_BYTES + 1 + 1 + 1;

/** P2TR scriptPubKey: OP_1 ‖ push-32 ‖ witness program(32) (BIP-341). */
const P2TR_SCRIPT_BYTES = 34;
const P2TR_OP_1 = 0x51;
const P2TR_PUSH_32 = 0x20;
const P2TR_WITNESS_PROGRAM_OFFSET = 2;

/** The terms a refund leaf commits to: signer key and CSV timelock. */
export interface RefundLeafTerms {
  /** UNTWEAKED x-only key inside the leaf (lowercase hex). */
  readonly leafKeyHex: string;
  readonly csv: number;
}

/**
 * Byte-for-byte mirror of the firmware's refund-leaf parser
 * (`fw:sign_psbt_validate_helpers.c:77-148`) — deliberately EXACTLY as loose:
 * OP_PUSHDATA1 and a non-minimal positive CScriptNum are accepted, because a
 * host grammar stricter than the device's would strand a refund the device
 * would sign. Returns `undefined` where the firmware returns false.
 */
export function parseRefundLeafScript(script: Uint8Array): RefundLeafTerms | undefined {
  if (script.length < REFUND_SCRIPT_MIN_LEN) return undefined;
  let pos = 0;
  if (script[pos++] !== OP_PUSHBYTES_32) return undefined;
  const leafKeyHex = Buffer.from(script.subarray(pos, pos + X_ONLY_KEY_BYTES)).toString("hex");
  pos += X_ONLY_KEY_BYTES;
  if (script[pos++] !== OP_CHECKSIGVERIFY) return undefined;

  if (pos >= script.length) return undefined;
  const pushOp = script[pos++];
  let csv = 0;
  if (pushOp === OP_0 || pushOp === OP_1NEGATE) {
    return undefined; // not a positive timelock
  } else if (pushOp >= OP_PUSHBYTES_1 && pushOp <= OP_PUSHBYTES_75) {
    const dataLen = pushOp;
    if (dataLen > SCRIPT_NUM_MAX_LEN || pos + dataLen > script.length) return undefined;
    if ((script[pos + dataLen - 1] & SCRIPT_NUM_SIGN_BIT) !== 0) return undefined; // negative
    for (let i = 0; i < dataLen; i++) csv |= script[pos + i] << (8 * i);
    pos += dataLen;
  } else if (pushOp === OP_PUSHDATA1) {
    if (pos >= script.length) return undefined;
    const dataLen = script[pos++];
    if (dataLen > SCRIPT_NUM_MAX_LEN || pos + dataLen > script.length) return undefined;
    if ((script[pos + dataLen - 1] & SCRIPT_NUM_SIGN_BIT) !== 0) return undefined; // negative
    for (let i = 0; i < dataLen; i++) csv |= script[pos + i] << (8 * i);
    pos += dataLen;
  } else if (pushOp >= OP_1 && pushOp <= OP_16) {
    csv = pushOp - OP_RESERVED;
  } else {
    return undefined;
  }
  // The sign-bit rejections above cap csv at 0x7fffffff — no uint32 wrap.
  if (csv === 0) return undefined;

  if (pos >= script.length) return undefined;
  if (script[pos++] !== OP_CHECKSEQUENCEVERIFY) return undefined;
  if (pos !== script.length) return undefined; // exact consumption

  return { leafKeyHex, csv };
}

/** What {@link classifyRefundPsbt} pins: the leaf terms plus input 0's prevout. */
export interface RefundPsbtClassification extends RefundLeafTerms {
  /** Input 0's previous txid in INTERNAL byte order (lowercase hex) — the
   * order the device compares against the loaded intent's `prepegin_txid`
   * (`fw:sign_psbt_validate.c:1076-1081`). */
  readonly inputTxidInternalHex: string;
}

/**
 * Classify a PSBT as a standalone refund from the PROVIDER'S OWN PARSE —
 * never from a caller flag: exactly 1 input and 1 output, and input 0 carries
 * exactly one tapscript leaf matching the firmware's refund grammar. Anything
 * else — including hex that does not parse — returns `undefined`, so the
 * caller's ordinary gates keep their error precedence.
 */
export function classifyRefundPsbt(psbtHex: string): RefundPsbtClassification | undefined {
  let psbt: Psbt;
  try {
    psbt = Psbt.fromHex(psbtHex);
  } catch {
    return undefined;
  }
  if (psbt.data.inputs.length !== 1 || psbt.data.outputs.length !== 1) return undefined;
  const leaves = psbt.data.inputs[0].tapLeafScript ?? [];
  if (leaves.length !== 1) return undefined;
  if (leaves[0].leafVersion !== TAPSCRIPT_LEAF_VERSION) return undefined;
  const terms = parseRefundLeafScript(leaves[0].script);
  if (terms === undefined) return undefined;
  return { ...terms, inputTxidInternalHex: Buffer.from(psbt.txInputs[0].hash).toString("hex") };
}

export interface AugmentPsbtForRefundParams {
  readonly psbtHex: string;
  /** The connected device's depositor x-only key (64 lowercase hex). */
  readonly depositorXOnlyHex: string;
  /** The device's master fingerprint (8 lowercase hex) — both entries carry it. */
  readonly masterFingerprintHex: string;
  /** The depositor's 5-level BIP-86 path — both entries carry it. */
  readonly depositorPath: readonly number[];
}

/**
 * Add the two TAP_BIP32_DERIVATION entries the device requires on a refund.
 * Re-classifies internally and requires the leaf key to be the depositor's —
 * augmenting anything that is not this device's refund is a caller bug, not a
 * shape to paper over. `leafHashes: []` is fine: the device's value parser
 * skips the hashes (`fw:sign_psbt_validate_helpers.c:58-63`). Never touches
 * the unsigned transaction.
 */
export function augmentPsbtForRefund(params: AugmentPsbtForRefundParams): string {
  const { psbtHex, depositorXOnlyHex, masterFingerprintHex, depositorPath } = params;
  if (!X_ONLY_HEX_RE.test(depositorXOnlyHex)) {
    throw new Error("depositorXOnlyHex must be 64 lowercase hex characters");
  }
  if (!MASTER_FINGERPRINT_HEX_RE.test(masterFingerprintHex)) {
    throw new Error("masterFingerprintHex must be 8 lowercase hex characters (the 4-byte master fingerprint)");
  }
  assertBip86Path("depositorPath", depositorPath);
  const classified = classifyRefundPsbt(psbtHex);
  if (classified === undefined) {
    throw new Error("not a refund-shaped PSBT (expected 1 input, 1 output, and one refund tapscript leaf)");
  }
  if (classified.leafKeyHex !== depositorXOnlyHex) {
    throw new Error("refund leaf key does not equal the depositor key — this device cannot sign this refund");
  }
  // The device never signs a refund below this floor in any state
  // (`fw:sign_psbt_validate.c:898-903`, IDLE/HASH_DERIVED branch;
  // `vault_constants.h:103`) — pre-empt its opaque SW_INCORRECT_DATA.
  if (classified.csv < DEVICE_TIMELOCK_MIN_BLOCKS) {
    throw new Error(
      `refund leaf CSV ${classified.csv} is below the device's timelock floor of ${DEVICE_TIMELOCK_MIN_BLOCKS} blocks`,
    );
  }
  const psbt = Psbt.fromHex(psbtHex);
  const outScript = Buffer.from(psbt.txOutputs[0].script);
  if (
    outScript.length !== P2TR_SCRIPT_BYTES ||
    outScript[0] !== P2TR_OP_1 ||
    outScript[1] !== P2TR_PUSH_32
  ) {
    throw new Error("refund output is not P2TR — the device compares its derivation entry against the witness program");
  }
  const masterFingerprint = Buffer.from(masterFingerprintHex, "hex");
  const path = bip86PathToString(depositorPath);
  psbt.updateInput(0, {
    tapBip32Derivation: [
      {
        masterFingerprint,
        pubkey: Buffer.from(depositorXOnlyHex, "hex"),
        path,
        leafHashes: [],
      },
    ],
  });
  psbt.updateOutput(0, {
    tapBip32Derivation: [
      {
        masterFingerprint,
        // The BIP-86 TWEAKED key, verbatim from the scriptPubKey — the device
        // looks the entry up by these exact bytes, then derives at `path`,
        // applies the BIP-86 tweak and compares (`fw:sign_psbt_validate.c:1005-1057`).
        // BIP-371 permits the output key as the map key ("It may be the output
        // key, the internal key, or a key present in a leaf script").
        pubkey: outScript.subarray(P2TR_WITNESS_PROGRAM_OFFSET),
        path,
        leafHashes: [],
      },
    ],
  });
  return psbt.toHex();
}
