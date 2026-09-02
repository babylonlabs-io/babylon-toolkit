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
import { bip86OutputScript } from "./expectedSignatures";

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

/** P2TR scriptPubKey: OP_1 ‖ push-32 ‖ witness program(32); program starts here. */
const P2TR_WITNESS_PROGRAM_OFFSET = 2;
/** The device requires the refund's witnessUtxo scriptPubKey to be exactly this
 * long — `VAULT_P2TR_SCRIPTPUBKEY_LEN` (`fw:sign_psbt_validate.c:836-854`). */
const P2TR_SCRIPT_BYTES = 34;

// BIP-68 sequence semantics the device pins on the refund input
// (`fw:sign_psbt_validate.c:956-979`; values from `fw:vault_constants.h:126-128`).
const BIP68_DISABLE_FLAG = 0x80000000;
const BIP68_TIME_BASED_FLAG = 0x00400000;
const BIP68_SEQUENCE_MASK = 0x0000ffff;

/** Refund transactions are v2 with locktime 0 (`fw:sign_psbt_validate.c:806-809`);
 * version 0 never even reaches refund dispatch — it routes to PoP (`:3551`). */
const MIN_REFUND_TX_VERSION = 2;
const REFUND_TX_LOCKTIME = 0;

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
 *
 * NOTE: the device's DISPATCH is looser still — it routes any conforming
 * prefix whose last byte is `OP_CSV` to the refund validator
 * (`fw:sign_psbt_validate.c:3643-3691`) and only then runs this grammar. Using
 * the full grammar for host classification (see {@link classifyRefundPsbt}) is
 * the deliberate, fail-safe divergence: under-classification falls back to
 * requiring an approved intent.
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

/** What {@link classifyRefundPsbt} pins: the leaf terms plus every transaction
 * field the device validates on the refund path. */
export interface RefundPsbtClassification extends RefundLeafTerms {
  /** Input 0's previous txid in INTERNAL byte order (lowercase hex) — the
   * order the device compares against the loaded intent's `prepegin_txid`
   * (`fw:sign_psbt_validate.c:1076-1081`). */
  readonly inputTxidInternalHex: string;
  /** Input 0's nSequence as encoded in the unsigned transaction. */
  readonly sequence: number;
  /** Input 0's witnessUtxo terms, when the map carries one. */
  readonly witnessUtxo: { readonly scriptLength: number; readonly value: number } | undefined;
  /** Output 0's scriptPubKey (lowercase hex). */
  readonly outputScriptHex: string;
  readonly outputValue: number;
}

/**
 * Classify a PSBT as a standalone refund from the PROVIDER'S OWN PARSE —
 * never from a caller flag: version ≥ 2 with locktime 0, exactly 1 input and
 * 1 output, and input 0 carrying exactly one tapscript leaf matching the
 * firmware's refund grammar. Anything else — including hex that does not
 * parse — returns `undefined`, so the caller's ordinary gates keep their
 * error precedence.
 *
 * DELIBERATELY a strict subset of the device's own routing: the firmware
 * dispatches on the leaf's shape prefix and terminal `OP_CSV` byte alone
 * (`fw:sign_psbt_validate.c:3643-3691`) and only then validates the full
 * grammar, version and locktime inside the refund validator. Host
 * under-classification is the fail-safe direction — an unrecognised PSBT
 * falls back to requiring an approved intent, so neither the intent gate nor
 * the replay guard can be waived for something the device would not treat as
 * a conforming refund.
 */
export function classifyRefundPsbt(psbtHex: string): RefundPsbtClassification | undefined {
  let psbt: Psbt;
  try {
    psbt = Psbt.fromHex(psbtHex);
  } catch {
    return undefined;
  }
  if (psbt.version < MIN_REFUND_TX_VERSION || psbt.locktime !== REFUND_TX_LOCKTIME) return undefined;
  if (psbt.data.inputs.length !== 1 || psbt.data.outputs.length !== 1) return undefined;
  const input = psbt.data.inputs[0];
  const leaves = input.tapLeafScript ?? [];
  if (leaves.length !== 1) return undefined;
  if (leaves[0].leafVersion !== TAPSCRIPT_LEAF_VERSION) return undefined;
  const terms = parseRefundLeafScript(leaves[0].script);
  if (terms === undefined) return undefined;
  return {
    ...terms,
    inputTxidInternalHex: Buffer.from(psbt.txInputs[0].hash).toString("hex"),
    sequence: psbt.txInputs[0].sequence ?? 0,
    witnessUtxo: input.witnessUtxo
      ? { scriptLength: input.witnessUtxo.script.length, value: input.witnessUtxo.value }
      : undefined,
    outputScriptHex: Buffer.from(psbt.txOutputs[0].script).toString("hex"),
    outputValue: psbt.txOutputs[0].value,
  };
}

/**
 * Pure signability pins for a classified refund — every term the device
 * validates that needs NO device data, so a caller can reject before any
 * device I/O (not even a liveness probe). Mirrors, in order: the witnessUtxo
 * requirement (`fw:sign_psbt_validate.c:836-854`), the output-value cap
 * (`:1059-1062`), destination ownership (the device derives, BIP-86-tweaks
 * and compares — `:1005-1057`; host-side the leaf key is the derivation
 * anchor, so the output must pay ITS BIP-86 address), the no-intent CSV floor
 * (`:898-903`, `vault_constants.h:103`), and the BIP-68 sequence pins
 * (`:956-979` — present, flags clear, low bits encoding exactly the CSV).
 */
export function assertRefundPsbtSignable(refund: RefundPsbtClassification): void {
  if (refund.witnessUtxo === undefined || refund.witnessUtxo.scriptLength !== P2TR_SCRIPT_BYTES) {
    throw new Error(
      "refund input must carry a P2TR witnessUtxo — the device rejects a missing or non-34-byte scriptPubKey",
    );
  }
  if (refund.outputValue > refund.witnessUtxo.value) {
    throw new Error(
      `refund output value ${refund.outputValue} exceeds the HTLC value ${refund.witnessUtxo.value} — the device rejects it`,
    );
  }
  if (refund.outputScriptHex !== bip86OutputScript(refund.leafKeyHex).toString("hex")) {
    throw new Error("refund output does not pay the refund leaf key's own BIP-86 address");
  }
  if (refund.csv < DEVICE_TIMELOCK_MIN_BLOCKS) {
    throw new Error(
      `refund leaf CSV ${refund.csv} is below the device's timelock floor of ${DEVICE_TIMELOCK_MIN_BLOCKS} blocks`,
    );
  }
  if ((refund.sequence & BIP68_DISABLE_FLAG) !== 0 || (refund.sequence & BIP68_TIME_BASED_FLAG) !== 0) {
    throw new Error(
      "refund input sequence must be a plain block-count relative timelock (BIP-68 disable/time flags clear)",
    );
  }
  if ((refund.sequence & BIP68_SEQUENCE_MASK) !== (refund.csv & BIP68_SEQUENCE_MASK)) {
    throw new Error(
      `refund input sequence ${refund.sequence} must encode exactly the leaf CSV ${refund.csv} — a mismatch signs but can never broadcast`,
    );
  }
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
  assertRefundPsbtSignable(classified);
  if (classified.leafKeyHex !== depositorXOnlyHex) {
    throw new Error("refund leaf key does not equal the depositor key — this device cannot sign this refund");
  }
  const psbt = Psbt.fromHex(psbtHex);
  // Validated by {@link assertRefundPsbtSignable}: the depositor's own BIP-86 P2TR.
  const outScript = Buffer.from(psbt.txOutputs[0].script);
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
