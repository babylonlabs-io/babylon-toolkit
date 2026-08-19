/**
 * BIP-322 "simple" proof-of-possession PSBT for the vault app's Screen 7.
 *
 * The device signs PoP as a SIGN_PSBT whose unsigned tx has `version == 0`
 * (`sign_psbt_validate.c:3213` @ 4decf822). The PSBT is the BIP-322 to_sign
 * transaction: one input spending to_spend:0 (sequence 0), one OP_RETURN
 * output of value 0, locktime 0, with the message in the global proprietary
 * key `FC 06 "bvault" 00` (`bip322.h:24-38`). The firmware rebuilds to_spend
 * from the message and the BIP-86 tweaked key and compares its raw SHA256d
 * against PSBT_IN_PREVIOUS_TXID (`bip322.c:203-213`, `:2794-2802`). Built as a
 * PSBTv0: the vendored v0→v2 conversion in prepareSignPsbt emits the
 * OUTPUT_INDEX/SEQUENCE keys the device requires physically present
 * (`:2806-2831`). Message grammar is NOT validated here — the device is the boundary.
 *
 * @module ledger-vault-signer/popPsbt
 */

import { crypto as bcrypto, Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { bip86OutputScript } from "./expectedSignatures";

const BIP322_TAG = "BIP0322-signed-message";
/** `0xFC ‖ 0x06 ‖ "bvault" ‖ 0x00` — `BIP322_PSBT_PROP_POP_MSG_KEY` (`bip322.c:10-11`; doc `bip322.h:22-29,37-38`). */
export const POP_MESSAGE_PROPRIETARY_KEY = new Uint8Array([0xfc, 0x06, 0x62, 0x76, 0x61, 0x75, 0x6c, 0x74, 0x00]);

const POP_TX_VERSION = 0;
const POP_LOCKTIME = 0;
const POP_SEQUENCE = 0;
const TO_SPEND_VOUT = 0;
const ZERO_SATS = 0;
const OP_RETURN_SCRIPT = Buffer.from([0x6a]);
const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;
const FINGERPRINT_HEX_RE = /^[0-9a-f]{8}$/;
const BIP86_PATH_LEVELS = 5;
const HARDENED = 0x80000000;
/** BIP-322 to_spend prevout: all-zero txid, vout 0xFFFFFFFF. */
const TO_SPEND_PREVOUT_TXID = Buffer.alloc(32, 0);
const TO_SPEND_PREVOUT_VOUT = 0xffffffff;
/** `OP_0 ‖ PUSHBYTES_32` — scriptSig prefix of the to_spend input. */
const TO_SPEND_SCRIPTSIG_PREFIX = Buffer.from([0x00, 0x20]);
/** `OP_1 ‖ PUSHBYTES_32` — P2TR scriptPubKey prefix (BIP-341). */
const P2TR_SCRIPT_PREFIX = Buffer.from([0x51, 0x20]);
/** P2TR scriptPubKey = prefix(2) ‖ witness program(32); the program starts here. */
const P2TR_WITNESS_PROGRAM_OFFSET = 2;

/** BIP-340 tagged hash; hand-rolled because BIP-322's tag is not in bitcoinjs' prefix table. */
function taggedHash(tag: string, data: Uint8Array): Buffer {
  const tagHash = bcrypto.sha256(Buffer.from(tag, "utf8"));
  return bcrypto.sha256(Buffer.concat([tagHash, tagHash, Buffer.from(data)]));
}

/**
 * BIP-322 to_spend txid: SHA256d of the legacy serialization, returned in
 * wire byte order (raw digest) — exactly what the firmware stores in
 * PSBT_IN_PREVIOUS_TXID (`bip322.c:103,203-213`).
 */
export function bip322ToSpendTxid(messageBytes: Uint8Array, tweakedXOnlyKey: Uint8Array): Uint8Array {
  const toSpend = new Transaction();
  toSpend.version = POP_TX_VERSION;
  toSpend.locktime = POP_LOCKTIME;
  // scriptSig = OP_0 PUSHBYTES_32 tagged_hash("BIP0322-signed-message", message)
  const scriptSig = Buffer.concat([TO_SPEND_SCRIPTSIG_PREFIX, taggedHash(BIP322_TAG, messageBytes)]);
  toSpend.addInput(TO_SPEND_PREVOUT_TXID, TO_SPEND_PREVOUT_VOUT, POP_SEQUENCE, scriptSig);
  toSpend.addOutput(Buffer.concat([P2TR_SCRIPT_PREFIX, Buffer.from(tweakedXOnlyKey)]), ZERO_SATS);
  // getHash(false) = SHA256d of the legacy (no-witness) serialization, raw order.
  return Uint8Array.from(toSpend.getHash(false));
}

export interface BuildPopPsbtParams {
  /** `<eth>:<chainId>:pegin:<registry>` exactly as the SDK built it (already lowercase). */
  readonly message: string;
  /** 64 lowercase hex — the device key at `depositorPath`. */
  readonly depositorXOnlyHex: string;
  /** 8 lowercase hex from `getMasterFingerprintHex`. */
  readonly masterFingerprintHex: string;
  /** 5-level BIP-86 path, raw u32 levels (hardened bits included). */
  readonly depositorPath: readonly number[];
}

function pathToString(levels: readonly number[]): string {
  return "m/" + levels.map((l) => ((l & HARDENED) !== 0 ? `${(l & ~HARDENED) >>> 0}'` : `${l >>> 0}`)).join("/");
}

/** Build the PoP to_sign PSBT (v0 hex) for `prepareSignPsbt` in wallet-policy mode. */
export function buildPopPsbtHex(params: BuildPopPsbtParams): string {
  const { message, depositorXOnlyHex, masterFingerprintHex, depositorPath } = params;
  if (!X_ONLY_HEX_RE.test(depositorXOnlyHex)) {
    throw new Error("depositorXOnlyHex must be 64 lowercase hex characters");
  }
  if (!FINGERPRINT_HEX_RE.test(masterFingerprintHex)) {
    throw new Error("masterFingerprintHex must be 8 lowercase hex characters");
  }
  if (depositorPath.length !== BIP86_PATH_LEVELS) {
    throw new Error(`depositorPath must have exactly ${BIP86_PATH_LEVELS} levels, got ${depositorPath.length}`);
  }
  const messageBytes = new TextEncoder().encode(message);
  const depositorKey = Buffer.from(depositorXOnlyHex, "hex");
  const toSpendScript = bip86OutputScript(depositorXOnlyHex); // 51 20 <tweaked>
  const toSpendTxid = bip322ToSpendTxid(messageBytes, toSpendScript.subarray(P2TR_WITNESS_PROGRAM_OFFSET));

  const psbt = new Psbt();
  psbt.setVersion(POP_TX_VERSION);
  psbt.setLocktime(POP_LOCKTIME);
  psbt.addInput({
    // A Buffer hash is used as-is (internal/wire order) — no reversal.
    hash: Buffer.from(toSpendTxid),
    index: TO_SPEND_VOUT,
    sequence: POP_SEQUENCE,
    witnessUtxo: { script: toSpendScript, value: ZERO_SATS },
    tapInternalKey: depositorKey,
    tapBip32Derivation: [
      {
        masterFingerprint: Buffer.from(masterFingerprintHex, "hex"),
        pubkey: depositorKey,
        path: pathToString(depositorPath),
        leafHashes: [],
      },
    ],
  });
  psbt.addOutput({ script: OP_RETURN_SCRIPT, value: ZERO_SATS });
  psbt.addUnknownKeyValToGlobal({ key: Buffer.from(POP_MESSAGE_PROPRIETARY_KEY), value: Buffer.from(messageBytes) });
  return psbt.toHex();
}
