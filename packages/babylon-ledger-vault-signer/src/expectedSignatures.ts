/**
 * SIGN_PSBT expected-signature table + per-YIELD collector (#2219).
 *
 * The device signs from an approved intent, not from what we display; the
 * table pins every YIELD's (input, spend-type, signer key, tapleaf hash)
 * against values computed from the exact map model committed to the device,
 * BEFORE the signature is recorded. A mismatch aborts the ceremony — a
 * misrouted signature must never reach the merge. Unit of expectation is
 * (input, leaf), not input; completion is set equality in both directions.
 *
 * YIELD wire shape (base app `sign_input.c:47-87`, protocol v1 / P2=1):
 * `varint(input_index) ‖ augm_len(1) ‖ pubkey_augm(augm_len) ‖ signature` —
 * tapscript: augm = untweaked x-only key(32) ‖ tapleaf_hash(32), keypath:
 * augm = tweaked output key(32); Schnorr sig is exactly 64 bytes at
 * SIGHASH_DEFAULT (a 65th byte means a non-zero sighash byte,
 * `sign_input.c:202-206` — reject, never strip).
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
/** Tapscript augm = x-only key(32) ‖ tapleaf hash(32) — base `sign_input.c:66`. */
const AUGM_TAPSCRIPT_BYTES = 64;
/** Keypath augm = tweaked x-only output key(32) — base `sign_input.c:208-215`. */
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
      /** UNTWEAKED depositor x-only key — `sign_input.c:211` with `tweak_data=NULL` on every vault path. */
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
}

// bitcoinjs `initEccLib` re-verifies only when handed a DIFFERENT instance —
// init once so a second tiny-secp256k1 copy in the bundle can't thrash the cache.
let eccInitialized = false;

/** BIP-86/BIP-341 keypath-only P2TR scriptPubKey of an x-only internal key. */
function bip86OutputScript(xOnlyKeyHex: string): Buffer {
  if (!eccInitialized) {
    initEccLib(ecc);
    eccInitialized = true;
  }
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

/**
 * Classify every input of the committed map model (build rules per the B1-c
 * spec §3.1; BIP-371 key types verified against base app `psbt.h:37-42`).
 * Throws `LedgerSignPsbtProtocolError` on any rule violation — all before any
 * device I/O.
 */
export function buildExpectedSignatureTable(params: BuildExpectedSignatureTableParams): ExpectedSignatureTable {
  const { psbt, depositorXOnlyHex } = params;
  const byInput = new Map<number, InputSigExpectation>();
  const inputCount = psbt.getGlobalInputCount();

  // Precompute the depositor-owned scriptPubKeys once for the ownership scan.
  const depositorP2trScript = bip86OutputScript(depositorXOnlyHex);
  const depositorP2wpkhScripts = [
    p2wpkhOutputScript(depositorXOnlyHex, COMPRESSED_KEY_EVEN_PREFIX),
    p2wpkhOutputScript(depositorXOnlyHex, COMPRESSED_KEY_ODD_PREFIX),
  ];

  for (let inputIndex = 0; inputIndex < inputCount; inputIndex++) {
    const leafEntries = psbt.getInputEntriesOfType(inputIndex, psbtIn.TAP_LEAF_SCRIPT);
    if (leafEntries.length > 0) {
      // Exactly one leaf per input for now — >1 is an ambiguous leaf set,
      // mirroring fw `sign_psbt_validate.c:2981,3004` and the ts-sdk rule.
      if (leafEntries.length > 1) {
        throw new LedgerSignPsbtProtocolError(
          `input ${inputIndex} carries an ambiguous leaf set (${leafEntries.length} TAP_LEAF_SCRIPT entries)`,
        );
      }
      const value = leafEntries[0].value;
      if (value.length < 1) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} TAP_LEAF_SCRIPT value is empty`);
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
      if (!psbt.getInputWitnessUtxo(inputIndex)) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} is tapscript but has no witnessUtxo`);
      }
      const script = value.subarray(0, value.length - 1);
      const leafHashHex = tapLeafHash(TAPSCRIPT_LEAF_VERSION, script).toString("hex");
      byInput.set(inputIndex, {
        kind: "tapscript",
        expectedLeafHashHexes: new Set([leafHashHex]),
        expectedSignerXOnlyHex: depositorXOnlyHex,
      });
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
      if (script.length !== P2TR_SCRIPT_BYTES || !script.subarray(0, 2).equals(P2TR_SCRIPT_PREFIX)) {
        throw new LedgerSignPsbtProtocolError(`input ${inputIndex} witnessUtxo script is not P2TR`);
      }
      // Pins "witness program" == "BIP-86 tweak of OUR key" independently.
      if (!script.equals(depositorP2trScript)) {
        throw new LedgerSignPsbtProtocolError(
          `input ${inputIndex} witnessUtxo is not the BIP-86 P2TR of the depositor key`,
        );
      }
      byInput.set(inputIndex, {
        kind: "taproot-keypath",
        expectedOutputKeyHex: script.subarray(2).toString("hex"),
      });
      continue;
    }

    // Not signed by the device (Payout input 1, NoPayout inputs 1-2 today).
    // Ownership scan: a depositor-owned UTXO here means our builder dropped
    // the device-required metadata — fail before burning a ceremony.
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

export function createYieldCollector(table: ExpectedSignatureTable): YieldCollector {
  const yields: CollectedYield[] = [];
  const seen = new Set<string>();

  const assertAndRecord = (payload: Buffer): void => {
    // Payload = request minus the 0x10 code byte, exactly base `sign_input.c:47-87`.
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
      if (signature.length !== SCHNORR_SIG_BYTES) {
        throw new LedgerYieldMismatchError("non-default-sighash", inputIndex);
      }
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
      if (signature.length !== SCHNORR_SIG_BYTES) {
        throw new LedgerYieldMismatchError("non-default-sighash", inputIndex);
      }
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
