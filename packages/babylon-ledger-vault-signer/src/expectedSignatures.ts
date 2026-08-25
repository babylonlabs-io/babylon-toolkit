/**
 * SIGN_PSBT expected-signature table + per-YIELD collector (#2219).
 *
 * The device signs from an approved intent, not from what we display; the
 * table pins every YIELD's (input, spend-type, signer key, tapleaf hash)
 * against values computed from the exact map model committed to the device,
 * BEFORE the signature is recorded. A mismatch aborts the ceremony — a
 * misrouted signature must never reach the merge. Unit of expectation is
 * (input, leaf), not input; completion is set equality in both directions.
 * Building the table also asserts each tapscript input's control block really
 * commits to its leaf, so a leaf the spent output never paid to is never armed.
 *
 * Firmware citations in this file are pinned, because the same path on another
 * branch shows the opposite behaviour: `base:` = LedgerHQ/app-bitcoin @
 * `e400d8d8` (`src/handler/sign_psbt/`, `src/common/`), `fw:` =
 * LedgerHQ/app-babylon-vault `fix/feedback` @ `90cf41f` (`src/`).
 *
 * YIELD wire shape (`base:sign_input.c:47-87`, protocol v1 / P2=1):
 * `varint(input_index) ‖ augm_len(1) ‖ pubkey_augm(augm_len) ‖ signature` —
 * tapscript: augm = untweaked x-only key(32) ‖ tapleaf_hash(32), keypath:
 * augm = tweaked output key(32); Schnorr sig is exactly 64 bytes at
 * SIGHASH_DEFAULT (a 65th byte means a non-zero sighash byte,
 * `base:sign_input.c:197-201` — reject, never strip).
 *
 * @module ledger-vault-signer/expectedSignatures
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { crypto as bcrypto, initEccLib, payments } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { LedgerSignPsbtIncompleteError, LedgerSignPsbtProtocolError, LedgerYieldMismatchError } from "./errors";
import { tapLeafHash } from "./tapLeafHash";
import { psbtIn } from "./vendor/ledger-bitcoin/psbtv2";
import { parseVarint, sanitizeBigintToNumber } from "./vendor/ledger-bitcoin/varint";

/** BIP-341 tapscript leaf version — the only one our builders emit. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;
const X_ONLY_KEY_BYTES = 32;
/** BIP-371 TAP_LEAF_SCRIPT value = script ‖ leaf_version(1): ≥1 script byte + the version byte. */
const MIN_TAP_LEAF_SCRIPT_VALUE_BYTES = 2;
/** BIP-341 control block head: `leaf_version|parity`(1) ‖ internal x-only key(32). */
const CONTROL_BLOCK_HEAD_BYTES = 33;
/** BIP-341 merkle path element (one sibling hash per taptree level). */
const TAPROOT_MERKLE_NODE_BYTES = 32;
/** BIP-341: bit 0 of control-block byte 0 is the taproot output key's y-parity. */
const CONTROL_BLOCK_PARITY_MASK = 0x01;
/** BIP-341 tagged-hash tags for the taptree fold and the output-key tweak. */
const TAPBRANCH_TAG = "TapBranch";
const TAPTWEAK_TAG = "TapTweak";
/**
 * Tapscript augm = x-only key(32) ‖ tapleaf hash(32). Line 66 fixes only the
 * +32 delta; `:206-207` is what pins the taproot `pubkey_len` at 32 (the ECDSA
 * call site at `:117` yields 33) — `base:sign_input.c:66,206-207`.
 */
const AUGM_TAPSCRIPT_BYTES = 64;
/** Keypath augm = tweaked x-only output key(32) — `base:sign_input.c:66,206-207,419-429`. */
const AUGM_KEYPATH_BYTES = 32;
/** BIP-340 Schnorr signature at SIGHASH_DEFAULT — no trailing sighash byte. */
const SCHNORR_SIG_BYTES = 64;
/** P2TR scriptPubKey: OP_1 ‖ push-32 ‖ program(32) (BIP-341). */
const P2TR_SCRIPT_BYTES = 34;
const P2TR_SCRIPT_PREFIX = Buffer.from([0x51, 0x20]);
/** P2WPKH scriptPubKey: OP_0 ‖ push-20 ‖ hash160(pubkey) (BIP-141). */
const P2WPKH_SCRIPT_PREFIX = Buffer.from([0x00, 0x14]);
const COMPRESSED_KEY_EVEN_PREFIX = 0x02;
const COMPRESSED_KEY_ODD_PREFIX = 0x03;

export type InputSigExpectation =
  | {
      readonly kind: "tapscript";
      /** TapLeaf hashes (lowercase hex) of this input's TAP_LEAF_SCRIPT entries. */
      readonly expectedLeafHashHexes: ReadonlySet<string>;
      /** UNTWEAKED depositor x-only key — the tapscript branch leaves `tweak_data` NULL
       * (`base:sign_input.c:430-433`), so no tweak is applied (`base:sign_input.c:159-161`). */
      readonly expectedSignerXOnlyHex: string;
    }
  | {
      readonly kind: "taproot-keypath";
      /** BIP-86 tweaked output key == witness program of the input's P2TR scriptPubKey. */
      readonly expectedOutputKeyHex: string;
    };

export interface ExpectedSignatureTable {
  /** inputIndex → expectation. Inputs absent here must never appear in a YIELD. */
  readonly byInput: ReadonlyMap<number, InputSigExpectation>;
  /** Σ over inputs: tapscript → |expectedLeafHashHexes|; keypath → 1. */
  readonly expectedYieldCount: number;
}

export type CollectedYield =
  | {
      readonly kind: "tapscript";
      readonly inputIndex: number;
      readonly signerXOnlyHex: string;
      readonly leafHashHex: string;
      /** Exactly 64 bytes (SIGHASH_DEFAULT on all vault paths). */
      readonly signature: Uint8Array;
    }
  | {
      readonly kind: "taproot-keypath";
      readonly inputIndex: number;
      readonly outputKeyHex: string;
      readonly signature: Uint8Array;
    };

/**
 * The per-input read surface of the vendored `PsbtV2` the table builder
 * consumes — structural, so no vendored symbol reaches the emitted
 * declarations (vendor d.ts is excluded from dist; see `vite.config.ts`).
 */
export interface ExpectedSignaturePsbt {
  getGlobalInputCount(): number;
  getInputEntriesOfType(
    inputIndex: number,
    keyType: number,
  ): readonly { readonly keyData: Buffer; readonly value: Buffer }[];
  getInputWitnessUtxo(inputIndex: number): { readonly amount: number; readonly scriptPubKey: Buffer } | undefined;
}

export interface BuildExpectedSignatureTableParams {
  /**
   * The exact map model committed to the device — pass the MerkelizedPsbt
   * instance, not a re-parse, so there is no parse/serialize gap.
   */
  readonly psbt: ExpectedSignaturePsbt;
  /** Connected depositor x-only key (64 lowercase hex) — pins the table. */
  readonly depositorXOnlyHex: string;
  /**
   * Input indices the caller asked to sign. Narrows TAPSCRIPT expectations
   * only, and is inert for key-path/policy signing — there the base app picks
   * the set. Structural gates still run on EVERY input. Omit to expect every
   * device-signable input (the pre-#2281 behaviour).
   */
  readonly signInputIndexes?: readonly number[];
}

/**
 * BIP-86/BIP-341 keypath-only P2TR scriptPubKey of an x-only internal key.
 * Package-internal: shared by the PoP and wallet-policy builders.
 */
export function bip86OutputScript(xOnlyKeyHex: string): Buffer {
  // Not memoized: bitcoinjs re-verifies only when handed a DIFFERENT instance
  // (`bitcoinjs-lib@6.1.7 src/ecc_lib.js:13-23`), so a "done" flag would
  // silently skip that check once another instance reached the same copy.
  initEccLib(ecc);
  const output = payments.p2tr({ internalPubkey: Buffer.from(xOnlyKeyHex, "hex") }).output;
  if (!output) {
    throw new LedgerSignPsbtProtocolError("p2tr produced no output script for the depositor key");
  }
  return output;
}

/** BIP-141 P2WPKH scriptPubKey for one compressed-key parity of an x-only key. */
function p2wpkhOutputScript(xOnlyKeyHex: string, parityPrefix: number): Buffer {
  const compressed = Buffer.concat([Buffer.from([parityPrefix]), Buffer.from(xOnlyKeyHex, "hex")]);
  return Buffer.concat([P2WPKH_SCRIPT_PREFIX, bcrypto.hash160(compressed)]);
}

/** BIP-341 P2TR scriptPubKey shape: `OP_1 ‖ push-32 ‖ output key(32)`. */
function isP2trScript(script: Buffer): boolean {
  return (
    script.length === P2TR_SCRIPT_BYTES && script.subarray(0, P2TR_SCRIPT_PREFIX.length).equals(P2TR_SCRIPT_PREFIX)
  );
}

/**
 * Assert the input's control block actually commits to the leaf we hashed:
 * fold the control block's merkle path onto the leaf hash and tweak its
 * internal key with the resulting root (BIP-341), then require the recomputed
 * taproot output key AND its y-parity to equal the ones the witnessUtxo pays
 * to. Without this the host would accept a signature over a leaf the spent
 * output never committed to. The firmware requires the same binding on the
 * flows it reconstructs (wire spec §8, Refund row →
 * `fw:sign_psbt_validate.c:513-562`, `_refund_verify_taproot_commitment`).
 */
function assertControlBlockCommitsToLeaf(
  inputIndex: number,
  controlBlock: Buffer,
  leafHash: Buffer,
  scriptPubKey: Buffer,
): void {
  if (!isP2trScript(scriptPubKey)) {
    throw new LedgerSignPsbtProtocolError(`input ${inputIndex} is tapscript but its witnessUtxo script is not P2TR`);
  }
  const pathBytes = controlBlock.length - CONTROL_BLOCK_HEAD_BYTES;
  if (pathBytes < 0 || pathBytes % TAPROOT_MERKLE_NODE_BYTES !== 0) {
    throw new LedgerSignPsbtProtocolError(
      `input ${inputIndex} control block length ${controlBlock.length} is not ` +
        `${CONTROL_BLOCK_HEAD_BYTES} plus a multiple of ${TAPROOT_MERKLE_NODE_BYTES}`,
    );
  }
  const internalKey = controlBlock.subarray(1, CONTROL_BLOCK_HEAD_BYTES);
  if (!ecc.isXOnlyPoint(internalKey)) {
    throw new LedgerSignPsbtProtocolError(`input ${inputIndex} control block internal key is not an x-only point`);
  }
  let node = leafHash;
  for (let offset = CONTROL_BLOCK_HEAD_BYTES; offset < controlBlock.length; offset += TAPROOT_MERKLE_NODE_BYTES) {
    const sibling = controlBlock.subarray(offset, offset + TAPROOT_MERKLE_NODE_BYTES);
    // BIP-341 orders each branch pair lexicographically before hashing.
    const pair = Buffer.compare(node, sibling) < 0 ? [node, sibling] : [sibling, node];
    node = bcrypto.taggedHash(TAPBRANCH_TAG, Buffer.concat(pair));
  }
  const tweak = bcrypto.taggedHash(TAPTWEAK_TAG, Buffer.concat([internalKey, node]));
  const tweaked = ecc.xOnlyPointAddTweak(internalKey, tweak);
  if (!tweaked) {
    // null = tweaked point at infinity; unreachable for a real key, but the
    // commitment is unverifiable when it happens, so it is never a pass.
    throw new LedgerSignPsbtProtocolError(`input ${inputIndex} control block internal key has no taproot output key`);
  }
  const outputKey = scriptPubKey.subarray(P2TR_SCRIPT_PREFIX.length);
  // Separate arms: this one binds the leaf to the spent output, the parity bit
  // below is a 1-bit consistency check — one message would hide which failed.
  if (!outputKey.equals(Buffer.from(tweaked.xOnlyPubkey))) {
    throw new LedgerSignPsbtProtocolError(
      `input ${inputIndex} control block does not commit to its TAP_LEAF_SCRIPT ` +
        `(recomputed taproot output key differs from the witnessUtxo witness program)`,
    );
  }
  if (tweaked.parity !== (controlBlock[0] & CONTROL_BLOCK_PARITY_MASK)) {
    throw new LedgerSignPsbtProtocolError(
      `input ${inputIndex} control block parity bit disagrees with the recomputed taproot output key`,
    );
  }
}

/**
 * Classify every input of the committed map model (build rules per the B1-c
 * spec §3.1; BIP-371 key types verified against `base:psbt.h:37-42`).
 * Throws `LedgerSignPsbtProtocolError` on any rule violation — all before any
 * device I/O.
 *
 * Carrying signing metadata is NOT the same as being signed: since #2281 Payout
 * input 1 carries the Assert payout leaf purely so the device can display the
 * terms, while the firmware signs input 0 alone — the index is the literal 0 at
 * `fw:sign_custom_inputs.c:276,334`, with no loop over inputs.
 * `signInputIndexes` is what separates the two.
 */
export function buildExpectedSignatureTable(params: BuildExpectedSignatureTableParams): ExpectedSignatureTable {
  const { psbt, depositorXOnlyHex, signInputIndexes } = params;
  const byInput = new Map<number, InputSigExpectation>();
  const inputCount = psbt.getGlobalInputCount();
  const requestedInputs = signInputIndexes === undefined ? undefined : new Set(signInputIndexes);
  const isRequested = (inputIndex: number): boolean => requestedInputs === undefined || requestedInputs.has(inputIndex);

  // Precompute the depositor-owned scriptPubKeys once for the ownership scan.
  const depositorP2trScript = bip86OutputScript(depositorXOnlyHex);
  const depositorP2wpkhScripts = [
    p2wpkhOutputScript(depositorXOnlyHex, COMPRESSED_KEY_EVEN_PREFIX),
    p2wpkhOutputScript(depositorXOnlyHex, COMPRESSED_KEY_ODD_PREFIX),
  ];

  for (let inputIndex = 0; inputIndex < inputCount; inputIndex++) {
    // A leaf input also carries TAP_INTERNAL_KEY (NUMS) by spec — wire spec §8,
    // PegIn row — so the leaf branch wins and never looks at the internal key.
    const leafEntries = psbt.getInputEntriesOfType(inputIndex, psbtIn.TAP_LEAF_SCRIPT);
    if (leafEntries.length > 0) {
      // Exactly one leaf per input for now — >1 is an ambiguous leaf set,
      // mirroring `fw:sign_psbt_validate.c:2981,3004` and the ts-sdk rule.
      if (leafEntries.length > 1) {
        throw new LedgerSignPsbtProtocolError(
          `input ${inputIndex} carries an ambiguous leaf set (${leafEntries.length} TAP_LEAF_SCRIPT entries)`,
        );
      }
      const value = leafEntries[0].value;
      if (value.length < MIN_TAP_LEAF_SCRIPT_VALUE_BYTES) {
        throw new LedgerSignPsbtProtocolError(
          `input ${inputIndex} TAP_LEAF_SCRIPT value length ${value.length} is below the ` +
            `${MIN_TAP_LEAF_SCRIPT_VALUE_BYTES}-byte minimum (script byte plus the leaf-version byte)`,
        );
      }
      // BIP-371: value = script ‖ leaf_version (1 trailing byte).
      const leafVersion = value[value.length - 1];
      if (leafVersion !== TAPSCRIPT_LEAF_VERSION) {
        throw new LedgerSignPsbtProtocolError(
          `input ${inputIndex} leaf version 0x${leafVersion.toString(16)} is not tapscript (0xc0)`,
        );
      }
      // Firmware requires witnessUtxo on every segwit input; catch its absence
      // in the zero-I/O preflight instead of burning an approved intent on-device.
      const leafWitnessUtxo = psbt.getInputWitnessUtxo(inputIndex);
      if (!leafWitnessUtxo) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} is tapscript but has no witnessUtxo`);
      }
      const script = value.subarray(0, value.length - 1);
      const leafHash = tapLeafHash(TAPSCRIPT_LEAF_VERSION, script);
      // BIP-371 keyData of a TAP_LEAF_SCRIPT entry IS the control block.
      assertControlBlockCommitsToLeaf(inputIndex, leafEntries[0].keyData, leafHash, leafWitnessUtxo.scriptPubKey);
      // Gated AFTER every structural gate above: a leaf we never sign is still
      // a leaf the spent output must have committed to.
      if (isRequested(inputIndex)) {
        byInput.set(inputIndex, {
          kind: "tapscript",
          expectedLeafHashHexes: new Set([leafHash.toString("hex")]),
          expectedSignerXOnlyHex: depositorXOnlyHex,
        });
      }
      continue;
    }

    const internalKeyEntries = psbt.getInputEntriesOfType(inputIndex, psbtIn.TAP_INTERNAL_KEY);
    if (internalKeyEntries.length > 0) {
      const entry = internalKeyEntries[0];
      if (internalKeyEntries.length > 1 || entry.keyData.length !== 0 || entry.value.length !== X_ONLY_KEY_BYTES) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} carries a malformed TAP_INTERNAL_KEY entry`);
      }
      // A foreign internal key is not ours to expect.
      if (entry.value.toString("hex") !== depositorXOnlyHex) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} internal key is not the connected depositor key`);
      }
      const witnessUtxo = psbt.getInputWitnessUtxo(inputIndex);
      if (!witnessUtxo) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} is keypath but has no witnessUtxo`);
      }
      const script = witnessUtxo.scriptPubKey;
      if (!isP2trScript(script)) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} witnessUtxo script is not P2TR`);
      }
      // Pins "witness program" == "BIP-86 tweak of OUR key" independently.
      if (!script.equals(depositorP2trScript)) {
        throw new LedgerSignPsbtProtocolError(
          `input ${inputIndex} witnessUtxo is not the BIP-86 P2TR of the depositor key`,
        );
      }
      // NEVER narrowed: under a policy the base app signs every internal input
      // (`base:sign_psbt.c:142-148`), so the device picks the set, not the caller.
      byInput.set(inputIndex, {
        kind: "taproot-keypath",
        expectedOutputKeyHex: script.subarray(P2TR_SCRIPT_PREFIX.length).toString("hex"),
      });
      continue;
    }

    // No taproot signing metadata at all (NoPayout inputs 1-2 today).
    // Ownership scan: a depositor-owned UTXO here means our builder dropped
    // the device-required metadata — fail before burning a ceremony. Deliberately
    // limited to these inputs: a Pre-PegIn keypath input legitimately IS the
    // depositor's BIP-86 P2TR, and leaf semantics (including where the depositor
    // key sits) are the device's job — the host's is the commitment asserted above.
    // Recognises only P2TR/P2WPKH shapes of the connected key; P2SH-P2WPKH and
    // P2PKH depositor UTXOs are deliberately out of scope (tripwire, not a guarantee).
    const witnessUtxo = psbt.getInputWitnessUtxo(inputIndex);
    if (
      witnessUtxo &&
      (witnessUtxo.scriptPubKey.equals(depositorP2trScript) ||
        depositorP2wpkhScripts.some((s) => witnessUtxo.scriptPubKey.equals(s)))
    ) {
      throw new LedgerSignPsbtProtocolError(
        `input ${inputIndex} spends a depositor-owned UTXO but carries no signing metadata`,
      );
    }
  }

  // A requested index with no expectation means the caller and the builder
  // disagree about the PSBT — a host bug, caught at zero device I/O.
  for (const inputIndex of requestedInputs ?? []) {
    if (!byInput.has(inputIndex)) {
      throw new LedgerSignPsbtProtocolError(
        `input ${inputIndex} was requested for signing but carries no signing metadata`,
      );
    }
  }

  if (byInput.size === 0) {
    // A signPsbt call with nothing to sign is a host bug — thrown before ANY APDU.
    throw new LedgerSignPsbtProtocolError("PSBT contains no depositor-signable input");
  }

  let expectedYieldCount = 0;
  for (const expectation of byInput.values()) {
    expectedYieldCount += expectation.kind === "tapscript" ? expectation.expectedLeafHashHexes.size : 1;
  }
  return { byInput, expectedYieldCount };
}

export interface YieldCollector {
  /**
   * Interpreter `onYield`: parse + assert + record. Throws
   * `LedgerYieldMismatchError` (semantic) / `LedgerSignPsbtProtocolError`
   * (unparseable). A throw propagates out of `interpreter.execute()` BEFORE
   * the payload is recorded (`clientCommands.ts` onYield seam).
   */
  assertAndRecord(payload: Buffer): void;
  readonly yields: readonly CollectedYield[];
  /** Drives onProgress in the loop. */
  readonly lastYield: CollectedYield | undefined;
  /**
   * After sw 0x9000, before merge: set equality in BOTH directions.
   * Throws `LedgerSignPsbtIncompleteError`.
   */
  assertComplete(): void;
}

function seenKeyOf(yielded: CollectedYield): string {
  return yielded.kind === "tapscript" ? `${yielded.inputIndex}:${yielded.leafHashHex}` : `${yielded.inputIndex}`;
}

/**
 * A short tail is a malformed payload, not a claim about which key signed; only
 * a longer one is the device appending a non-zero sighash byte
 * (`base:sign_input.c:197-201` — reject, never strip).
 */
function assertSignatureLength(length: number, inputIndex: number): void {
  if (length < SCHNORR_SIG_BYTES) {
    throw new LedgerSignPsbtProtocolError(
      `YIELD payload truncated inside the signature (${length} of ${SCHNORR_SIG_BYTES} bytes on input ${inputIndex})`,
    );
  }
  if (length !== SCHNORR_SIG_BYTES) {
    throw new LedgerYieldMismatchError("non-default-sighash", inputIndex);
  }
}

export function createYieldCollector(table: ExpectedSignatureTable): YieldCollector {
  const yields: CollectedYield[] = [];
  const seen = new Set<string>();

  const assertAndRecord = (payload: Buffer): void => {
    // Payload = request minus the 0x10 code byte, exactly `base:sign_input.c:47-87`.
    let inputIndex: number;
    let offset: number;
    try {
      const [value, size] = parseVarint(payload, 0);
      inputIndex = sanitizeBigintToNumber(value);
      offset = size;
    } catch (error) {
      throw new LedgerSignPsbtProtocolError(
        `unparseable YIELD payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const augmLen = payload[offset];
    if (augmLen === undefined) {
      throw new LedgerSignPsbtProtocolError("YIELD payload truncated before the augmented-pubkey length");
    }
    const expectation = table.byInput.get(inputIndex);
    if (expectation === undefined) {
      throw new LedgerYieldMismatchError("unexpected-input", inputIndex);
    }

    if (augmLen === AUGM_TAPSCRIPT_BYTES) {
      if (expectation.kind !== "tapscript") {
        throw new LedgerYieldMismatchError("wrong-spend-type", inputIndex);
      }
      const augmEnd = offset + 1 + AUGM_TAPSCRIPT_BYTES;
      if (payload.length < augmEnd) {
        throw new LedgerSignPsbtProtocolError("YIELD payload truncated inside the augmented pubkey");
      }
      const signerXOnlyHex = payload.subarray(offset + 1, offset + 1 + X_ONLY_KEY_BYTES).toString("hex");
      const leafHashHex = payload.subarray(offset + 1 + X_ONLY_KEY_BYTES, augmEnd).toString("hex");
      const signature = payload.subarray(augmEnd);
      if (signerXOnlyHex !== expectation.expectedSignerXOnlyHex) {
        throw new LedgerYieldMismatchError("wrong-signer-key", inputIndex);
      }
      if (!expectation.expectedLeafHashHexes.has(leafHashHex)) {
        throw new LedgerYieldMismatchError("unknown-leaf-hash", inputIndex);
      }
      assertSignatureLength(signature.length, inputIndex);
      const recorded: CollectedYield = {
        kind: "tapscript",
        inputIndex,
        signerXOnlyHex,
        leafHashHex,
        signature: Uint8Array.from(signature),
      };
      if (seen.has(seenKeyOf(recorded))) {
        throw new LedgerYieldMismatchError("duplicate-yield", inputIndex);
      }
      seen.add(seenKeyOf(recorded));
      yields.push(recorded);
      return;
    }

    if (augmLen === AUGM_KEYPATH_BYTES) {
      if (expectation.kind !== "taproot-keypath") {
        throw new LedgerYieldMismatchError("wrong-spend-type", inputIndex);
      }
      const augmEnd = offset + 1 + AUGM_KEYPATH_BYTES;
      if (payload.length < augmEnd) {
        throw new LedgerSignPsbtProtocolError("YIELD payload truncated inside the augmented pubkey");
      }
      const outputKeyHex = payload.subarray(offset + 1, augmEnd).toString("hex");
      const signature = payload.subarray(augmEnd);
      if (outputKeyHex !== expectation.expectedOutputKeyHex) {
        throw new LedgerYieldMismatchError("wrong-signer-key", inputIndex);
      }
      assertSignatureLength(signature.length, inputIndex);
      const recorded: CollectedYield = {
        kind: "taproot-keypath",
        inputIndex,
        outputKeyHex,
        signature: Uint8Array.from(signature),
      };
      if (seen.has(seenKeyOf(recorded))) {
        throw new LedgerYieldMismatchError("duplicate-yield", inputIndex);
      }
      seen.add(seenKeyOf(recorded));
      yields.push(recorded);
      return;
    }

    // 33 = ECDSA compressed — never legitimate on our P2TR-only inputs.
    throw new LedgerYieldMismatchError("unexpected-encoding", inputIndex);
  };

  const assertComplete = (): void => {
    const expectedKeys = new Set<string>();
    for (const [inputIndex, expectation] of table.byInput) {
      if (expectation.kind === "tapscript") {
        for (const leafHashHex of expectation.expectedLeafHashHexes) {
          expectedKeys.add(`${inputIndex}:${leafHashHex}`);
        }
      } else {
        expectedKeys.add(`${inputIndex}`);
      }
    }
    const missing = [...expectedKeys].filter((key) => !seen.has(key));
    // The per-YIELD check already forbids extras; assert both directions anyway.
    const hasExtras = [...seen].some((key) => !expectedKeys.has(key));
    if (missing.length > 0 || hasExtras || seen.size !== table.expectedYieldCount) {
      throw new LedgerSignPsbtIncompleteError(missing);
    }
  };

  return {
    assertAndRecord,
    get yields(): readonly CollectedYield[] {
      return yields;
    },
    get lastYield(): CollectedYield | undefined {
      return yields[yields.length - 1];
    },
    assertComplete,
  };
}
