/**
 * PSBT and leaf builders reproducing the firmware test suite's delegated-claim
 * shapes byte-for-byte (`LedgerHQ/app-babylon-vault` @ `b0c0ac4d`):
 * `tests/test_screen4_claim.py:54-104` (`_build_claim_psbt`),
 * `tests/test_screen6_wc.py:56-121` (`_build_wc_leaf`, `_build_wc_psbt`),
 * `tests/test_sign_psbt_validate.py:1000-1086` (`_payout_leaf`,
 * `_build_payout_finalize_psbt`), `tests/test_screen5_assert.py:85-168`
 * (`_assert_signer_prefix`, `_build_assert_psbt`). Values, prevouts, sequences and output
 * scripts follow the Python builders. Three fields do not: the master
 * fingerprint (the suite reads the emulator's, this file uses the provider
 * tests' fixture), the two challenger keys (this file uses the
 * refundPsbt.wasmGrammar roster, not the suite's `TEST_VALID_KEYS`), and the
 * `wasm` derivation shape, which follows btc-vault's builder
 * (`crates/vault/src/psbt.rs:65-75` @ `ac4954e7`) rather than the suite's —
 * that is the shape the host actually receives. A fourth: every leaf input
 * carries `tapInternalKey: NUMS`, as btc-vault's builder writes it
 * (`psbt.rs:54`); the suite sets it only in two places, and the device reads
 * the control block instead (`fw:sign_psbt_validate.c:762-771`).
 */
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, payments, Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { HARDENED } from "../../bip86Path";
import { tapLeafHash } from "../../tapLeafHash";

initEccLib(ecc);

/** BIP-86 test-vector depositor key (same as refundPsbt.test.ts and the provider tests). */
export const DEPOSITOR_XONLY = "dc8d2f9eff0c4f4dbde070a48e330efc908b62a766568d91e658f284b324b878";
export const FOREIGN_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
/** `VAULT_NUMS_XONLY` (`tests/test_sign_psbt_validate.py:85-87`) — the unspendable internal key. */
const NUMS_XONLY = "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";
/** Challenger keys for the payout leaf's two 1-of-1 groups (refundPsbt.wasmGrammar.test.ts roster). */
export const KEEPER_XONLY = "25d1dff95105f5253c4022f628a996ad3a0d95fbf21d468a1b33f8c160d8f517";
export const CHALLENGER_XONLY = "2f01e5e15cca351daff3843fb70f3c2f0a1bdd05e5af888a67784ef3e10a2a01";
export const MASTER_FINGERPRINT = "73c5da0a";
export const DEPOSITOR_PATH: readonly number[] = [86 + HARDENED, 1 + HARDENED, 0 + HARDENED, 0, 0];

const OP_PUSHBYTES_32 = 0x20;
const OP_CHECKSIG = 0xac;
const OP_CHECKSIGVERIFY = 0xad;
const OP_CSV = 0xb2;
const OP_SIZE = 0x82;
const OP_PUSHBYTES_1 = 0x01;
const OP_EQUALVERIFY = 0x88;
const OP_SHA256 = 0xa8;
const OP_EQUAL = 0x87;
const OP_1 = 0x51;
const OP_NUMEQUALVERIFY = 0x9d;
const TAPSCRIPT_LEAF_VERSION = 0xc0;

/** `_PAYOUT_TIMELOCK` (`test_sign_psbt_validate.py:134`). */
export const PAYOUT_TIMELOCK = 200;
/** `_OUTPUT_LABEL_HASH` (`test_screen6_wc.py:53`). */
export const WC_OUTPUT_LABEL_HASH = Buffer.alloc(32, 0xcc);

/** `<D> OP_CHECKSIG` — `test_screen4_claim.py:69`. */
export function claimLeaf(keyHex: string): Buffer {
  return Buffer.concat([Buffer.from([OP_PUSHBYTES_32]), Buffer.from(keyHex, "hex"), Buffer.from([OP_CHECKSIG])]);
}

/** The 73-byte WC leaf — `test_screen6_wc.py:56-74`. */
export function wcLeaf(keyHex: string, labelHash: Buffer = WC_OUTPUT_LABEL_HASH): Buffer {
  return Buffer.concat([
    Buffer.from([OP_PUSHBYTES_32]),
    Buffer.from(keyHex, "hex"),
    Buffer.from([OP_CHECKSIGVERIFY, OP_SIZE, OP_PUSHBYTES_1, 0x20, OP_EQUALVERIFY, OP_SHA256, OP_PUSHBYTES_32]),
    labelHash,
    Buffer.from([OP_EQUAL]),
  ]);
}

/**
 * Minimal positive CScriptNum push, as `_encode_script_num` emits it ABOVE the
 * OP_N range (`test_sign_psbt_validate.py:99-100` emits a bare OP_N for 1..16,
 * which this does not; the t2 band starts at 90, so the divergence is
 * unreachable here and refused rather than silently wrong).
 */
export function scriptNumPush(value: number): Buffer {
  if (value <= 16) {
    throw new Error(
      `scriptNumPush(${value}): the Python builder emits a bare OP_N below 17; this helper would diverge`,
    );
  }
  const bytes: number[] = [];
  for (let v = value; v > 0; v >>= 8) bytes.push(v & 0xff);
  if ((bytes[bytes.length - 1] & 0x80) !== 0) bytes.push(0);
  return Buffer.from([bytes.length, ...bytes]);
}

/** `<D> OP_CHECKSIGVERIFY <AppChal 1-of-1> <UnivChal 1-of-1> <t2> OP_CSV` — `test_sign_psbt_validate.py:1000-1011`. */
export function payoutLeaf(
  keyHex: string,
  t2: number = PAYOUT_TIMELOCK,
  appChallengerHex: string = KEEPER_XONLY,
  universalChallengerHex: string = CHALLENGER_XONLY,
): Buffer {
  const group = (hex: string) =>
    Buffer.concat([
      Buffer.from([OP_PUSHBYTES_32]),
      Buffer.from(hex, "hex"),
      Buffer.from([OP_CHECKSIG, OP_1, OP_NUMEQUALVERIFY]),
    ]);
  return Buffer.concat([
    Buffer.from([OP_PUSHBYTES_32]),
    Buffer.from(keyHex, "hex"),
    Buffer.from([OP_CHECKSIGVERIFY]),
    group(appChallengerHex),
    group(universalChallengerHex),
    scriptNumPush(t2),
    Buffer.from([OP_CSV]),
  ]);
}

/**
 * The synthetic 107-byte Assert leaf the firmware suite signs
 * (`test_screen5_assert.py:85-99, 130-135`): the real leaf's 106-byte signer
 * prefix `<D> OP_CHECKSIGVERIFY <VK 1-of-1> <UC 1-of-1>` with the WOTS
 * verifier body replaced by its bare OP_TRUE terminator. Shape-identical to
 * what the dispatcher tests; the real 11-13 kB body is proven on Speculos.
 */
export function assertLeaf(keyHex: string): Buffer {
  const group = (hex: string) =>
    Buffer.concat([
      Buffer.from([OP_PUSHBYTES_32]),
      Buffer.from(hex, "hex"),
      Buffer.from([OP_CHECKSIG, OP_1, OP_NUMEQUALVERIFY]),
    ]);
  return Buffer.concat([
    Buffer.from([OP_PUSHBYTES_32]),
    Buffer.from(keyHex, "hex"),
    Buffer.from([OP_CHECKSIGVERIFY]),
    group(KEEPER_XONLY),
    group(CHALLENGER_XONLY),
    Buffer.from([OP_1]),
  ]);
}

/** Single-leaf taptree over NUMS: the spent scriptPubKey and its control block (`0xc0|parity ‖ NUMS`). */
export function singleLeafP2tr(leaf: Buffer): {
  output: Buffer;
  controlBlock: Buffer;
} {
  const p2tr = payments.p2tr({
    internalPubkey: Buffer.from(NUMS_XONLY, "hex"),
    scriptTree: { output: leaf },
    redeem: { output: leaf, redeemVersion: TAPSCRIPT_LEAF_VERSION },
  });
  if (!p2tr.output || !p2tr.witness) {
    throw new Error("p2tr produced no output or witness");
  }
  return {
    output: p2tr.output,
    controlBlock: p2tr.witness[p2tr.witness.length - 1],
  };
}

/** `_bip86_p2tr_spk(key)` — the BIP-86 key-path P2TR of an x-only key. */
export function bip86Spk(keyHex: string): Buffer {
  const output = payments.p2tr({
    internalPubkey: Buffer.from(keyHex, "hex"),
  }).output;
  if (!output) throw new Error("p2tr produced no output");
  return output;
}

/** `SEQUENCE_FINAL` (`fw:vault_constants.h:136`). */
const SEQUENCE_FINAL = 0xffffffff;
/**
 * What the Python PayoutFinalize builder puts on the unsigned input 0
 * (`test_sign_psbt_validate.py:1028-1031`). btc-vault's builder writes the
 * PegIn CSV timelock there instead (`payout.rs:103-112` @ ac4954e7); neither
 * the device (`:3417-3419`) nor the host reads input 0's sequence.
 */
const VAULT_INPUT_SEQUENCE = 0xfffffffe;
/** `VAULT_DUST_LIMIT` (`fw:vault_constants.h:64`). */
export const VAULT_DUST_LIMIT_SATS = 546;
/** `_build_claim_psbt` defaults (`test_screen4_claim.py:58-59`). */
const CLAIM_INPUT_VALUE = 1_200_000;
const CLAIM_CONNECTOR_VALUE = 600_000;
/** `_build_wc_psbt` defaults (`test_screen6_wc.py:81-82`). */
const WC_INPUT_VALUE = 5_000_000;
const WC_OUT_VALUE = 4_900_000;
/** `_build_payout_finalize_psbt` defaults (`test_sign_psbt_validate.py:1021-1023`). */
const PF_AMOUNT_RECEIVED = 1_234_567;
const PF_VAULT_AMOUNT = 2_000_000;
/** `bytes([0x51, 0x20]) + bytes(32)` — the builders' dummy P2TR scripts. */
const DUMMY_P2TR_SPK = Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0)]);
/** Prevouts the Python builders hard-code (internal byte order). */
export const CLAIM_PREV_HASH = Buffer.alloc(32, 0xab);
const WC_PREV_HASH = Buffer.alloc(32, 0xef);
const PF_VAULT_PREV_HASH = Buffer.alloc(32, 0xaa);
const PF_ASSERT_PREV_HASH = Buffer.alloc(32, 0xbb);

/**
 * Which TAP_BIP32_DERIVATION entries the signed input carries:
 * `wasm` = the zero-fingerprint, empty-path entries btc-vault's builders emit,
 * `none` = no entry. There is no `device` shape: what the augmentation writes
 * is asserted on its output, never built here.
 */
export type DerivationShape = "wasm" | "none";

/**
 * One zero-fingerprint entry per signing key, each carrying the leaf hash
 * (`btc-vault crates/vault/src/psbt.rs:65-75` @ `ac4954e7` — D alone on
 * Claim/WC, D plus every challenger on the claimer Payout).
 */
function derivationEntries(keysHex: readonly string[], shape: DerivationShape, leaf: Buffer) {
  if (shape === "none") return {};
  const leafHash = tapLeafHash(TAPSCRIPT_LEAF_VERSION, leaf);
  return {
    tapBip32Derivation: keysHex.map((keyHex) => ({
      masterFingerprint: Buffer.alloc(4, 0),
      pubkey: Buffer.from(keyHex, "hex"),
      path: "m",
      leafHashes: [leafHash],
    })),
  };
}

export interface ShapeOverrides {
  leafKeyHex?: string;
  leaf?: Buffer;
  leafVersion?: number;
  version?: number;
  locktime?: number;
  dropLeaf?: boolean;
  extraLeaf?: boolean;
  outputs?: readonly { script: Buffer; value: number }[];
  derivation?: DerivationShape;
}

function leafEntry(leaf: Buffer, leafVersion: number, controlBlock: Buffer) {
  // bip174 requires controlBlock[0]'s version bits to equal leafVersion.
  const versioned = Buffer.concat([Buffer.from([leafVersion | (controlBlock[0] & 0x01)]), controlBlock.subarray(1)]);
  return { leafVersion, script: leaf, controlBlock: versioned };
}

function leafEntries(leaf: Buffer, o: ShapeOverrides) {
  if (o.dropLeaf) return {};
  const { controlBlock } = singleLeafP2tr(leaf);
  const version = o.leafVersion ?? TAPSCRIPT_LEAF_VERSION;
  const entries = [leafEntry(leaf, version, controlBlock)];
  if (o.extraLeaf) {
    // Distinct control block — bip174 keys TAP_LEAF_SCRIPT by it.
    entries.push(leafEntry(leaf, version, Buffer.concat([controlBlock, Buffer.alloc(32, 0x44)])));
  }
  return { tapLeafScript: entries };
}

/** `_build_claim_psbt`: 1 in (`<D> OP_CHECKSIG`), 2 out (dummy connector, 546 to P2TR(D)). */
export function buildClaimShapedPsbt(o: ShapeOverrides = {}): string {
  const keyHex = o.leafKeyHex ?? DEPOSITOR_XONLY;
  const leaf = o.leaf ?? claimLeaf(keyHex);
  const { output } = singleLeafP2tr(leaf);
  const psbt = new Psbt();
  psbt.setVersion(o.version ?? 2);
  psbt.setLocktime(o.locktime ?? 0);
  psbt.addInput({
    hash: CLAIM_PREV_HASH,
    index: 0,
    sequence: SEQUENCE_FINAL,
    witnessUtxo: { script: output, value: CLAIM_INPUT_VALUE },
    ...leafEntries(leaf, o),
    tapInternalKey: Buffer.from(NUMS_XONLY, "hex"),
    ...derivationEntries([keyHex], o.derivation ?? "wasm", leaf),
  });
  for (const out of o.outputs ?? [
    { script: DUMMY_P2TR_SPK, value: CLAIM_CONNECTOR_VALUE },
    { script: bip86Spk(keyHex), value: VAULT_DUST_LIMIT_SATS },
  ]) {
    psbt.addOutput(out);
  }
  return psbt.toHex();
}

/** `_build_assert_psbt` defaults (`test_screen5_assert.py:105-107`); the prevout is `_FAKE_CLAIM_TXID = bytes(range(32))`. */
const ASSERT_CLAIM_TXID = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const ASSERT_AMOUNT_CARRIED = 5_000_000;
const ASSERT_OUT_VALUE = 4_990_000;

/** `_build_assert_psbt`: 1 in (synthetic Assert leaf, seq FINAL), 1 out to a dummy P2TR. `extraInputValue` adds a second input. */
export function buildAssertShapedPsbt(o: ShapeOverrides & { extraInputValue?: number } = {}): string {
  const keyHex = o.leafKeyHex ?? DEPOSITOR_XONLY;
  const leaf = o.leaf ?? assertLeaf(keyHex);
  const { output } = singleLeafP2tr(leaf);
  const psbt = new Psbt();
  psbt.setVersion(o.version ?? 2);
  psbt.setLocktime(o.locktime ?? 0);
  psbt.addInput({
    hash: ASSERT_CLAIM_TXID,
    index: 0,
    sequence: SEQUENCE_FINAL,
    witnessUtxo: { script: output, value: ASSERT_AMOUNT_CARRIED },
    ...leafEntries(leaf, o),
    tapInternalKey: Buffer.from(NUMS_XONLY, "hex"),
    ...derivationEntries([keyHex], o.derivation ?? "wasm", leaf),
  });
  if (o.extraInputValue !== undefined) {
    psbt.addInput({
      hash: Buffer.alloc(32, 0x33),
      index: 1,
      sequence: SEQUENCE_FINAL,
      witnessUtxo: { script: bip86Spk(FOREIGN_XONLY), value: o.extraInputValue },
    });
  }
  for (const out of o.outputs ?? [{ script: DUMMY_P2TR_SPK, value: ASSERT_OUT_VALUE }]) {
    psbt.addOutput(out);
  }
  return psbt.toHex();
}

/** `_build_wc_psbt`: 1 in (73-byte WC leaf), 1 out to P2TR(D). `extraInputValue` adds a wallet fee input. */
export function buildWcShapedPsbt(o: ShapeOverrides & { extraInputValue?: number } = {}): string {
  const keyHex = o.leafKeyHex ?? DEPOSITOR_XONLY;
  const leaf = o.leaf ?? wcLeaf(keyHex);
  const { output } = singleLeafP2tr(leaf);
  const psbt = new Psbt();
  psbt.setVersion(o.version ?? 2);
  psbt.setLocktime(o.locktime ?? 0);
  psbt.addInput({
    hash: WC_PREV_HASH,
    index: 0,
    sequence: SEQUENCE_FINAL,
    witnessUtxo: { script: output, value: WC_INPUT_VALUE },
    ...leafEntries(leaf, o),
    tapInternalKey: Buffer.from(NUMS_XONLY, "hex"),
    ...derivationEntries([keyHex], o.derivation ?? "wasm", leaf),
  });
  if (o.extraInputValue !== undefined) {
    // "Wallet inputs for fees" — counted, not validated (`fw:sign_psbt_validate.c:2876-2878`).
    psbt.addInput({
      hash: Buffer.alloc(32, 0x33),
      index: 1,
      sequence: SEQUENCE_FINAL,
      witnessUtxo: {
        script: bip86Spk(FOREIGN_XONLY),
        value: o.extraInputValue,
      },
    });
  }
  for (const out of o.outputs ?? [{ script: bip86Spk(keyHex), value: WC_OUT_VALUE }]) {
    psbt.addOutput(out);
  }
  return psbt.toHex();
}

export interface PayoutShapeOverrides extends ShapeOverrides {
  t2?: number;
  /** Put a leaf (and the D derivation entry) on input 0 — the depositor Payout shape. */
  input0Leaf?: Buffer;
  /** Put a derivation entry for this key on input 0 without a leaf. */
  input0DerivationKeyHex?: string;
}

/**
 * `_build_payout_finalize_psbt`: input 0 = Vault UTXO (no leaf, no
 * derivation, seq 0xFFFFFFFE), input 1 = Assert:0 payout leaf (seq t2,
 * 546 sat), outputs [amount_received, 546] both to P2TR(D). With
 * `input0Leaf` it is the depositor Payout instead.
 */
export function buildPayoutShapedPsbt(o: PayoutShapeOverrides = {}): string {
  const keyHex = o.leafKeyHex ?? DEPOSITOR_XONLY;
  const t2 = o.t2 ?? PAYOUT_TIMELOCK;
  const leaf = o.leaf ?? payoutLeaf(keyHex, t2);
  const { output } = singleLeafP2tr(leaf);
  const psbt = new Psbt();
  psbt.setVersion(o.version ?? 2);
  psbt.setLocktime(o.locktime ?? 0);
  psbt.addInput({
    hash: PF_VAULT_PREV_HASH,
    index: 0,
    sequence: VAULT_INPUT_SEQUENCE,
    witnessUtxo: {
      script: o.input0Leaf ? singleLeafP2tr(o.input0Leaf).output : DUMMY_P2TR_SPK,
      value: PF_VAULT_AMOUNT,
    },
    ...(o.input0Leaf
      ? {
          tapLeafScript: [leafEntry(o.input0Leaf, TAPSCRIPT_LEAF_VERSION, singleLeafP2tr(o.input0Leaf).controlBlock)],
          ...derivationEntries([keyHex], "wasm", o.input0Leaf),
        }
      : {}),
    ...(o.input0DerivationKeyHex ? derivationEntries([o.input0DerivationKeyHex], "wasm", o.input0Leaf ?? leaf) : {}),
  });
  psbt.addInput({
    hash: PF_ASSERT_PREV_HASH,
    index: 0,
    sequence: t2,
    witnessUtxo: { script: output, value: VAULT_DUST_LIMIT_SATS },
    ...leafEntries(leaf, o),
    tapInternalKey: Buffer.from(NUMS_XONLY, "hex"),
    // The claimer Payout's signing set is D plus every challenger (payout.rs:461-462 @ ac4954e7).
    ...derivationEntries([keyHex, KEEPER_XONLY, CHALLENGER_XONLY], o.derivation ?? "wasm", leaf),
  });
  for (const out of o.outputs ?? [
    { script: bip86Spk(keyHex), value: PF_AMOUNT_RECEIVED },
    { script: bip86Spk(keyHex), value: VAULT_DUST_LIMIT_SATS },
  ]) {
    psbt.addOutput(out);
  }
  return psbt.toHex();
}

/** A Vault-UTXO-style leaf: `<D> OP_CHECKSIGVERIFY <VP> OP_CHECKSIGVERIFY <t> OP_CSV` — whatever input 0 of a depositor Payout carries. */
export function vaultUtxoLeaf(keyHex: string): Buffer {
  return Buffer.concat([
    Buffer.from([OP_PUSHBYTES_32]),
    Buffer.from(keyHex, "hex"),
    Buffer.from([OP_CHECKSIGVERIFY, OP_PUSHBYTES_32]),
    Buffer.from(FOREIGN_XONLY, "hex"),
    Buffer.from([OP_CHECKSIGVERIFY]),
    scriptNumPush(PAYOUT_TIMELOCK),
    Buffer.from([OP_CSV]),
  ]);
}
