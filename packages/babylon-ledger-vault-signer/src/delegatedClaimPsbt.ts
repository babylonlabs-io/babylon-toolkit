/**
 * Delegated-claim PSBT classification and derivation-field augmentation
 * (#2111), on the refund template (`./refundPsbt.ts`).
 *
 * Three of the depositor-as-claimer signatures are standalone on the device —
 * accepted with NO loaded intent: Claim (Screen 4), WronglyChallenged
 * (Screen 6) and the claimer Payout, which the device dispatches as
 * PayoutFinalize (Screen 8) and signs at INPUT 1. The Assert (Screen 5) is
 * intent-bound but goes through the same standalone signing section, so it
 * needs the same derivation entry; the provider gates it on a loaded intent.
 * The depositor Payout is recognised only so a caller can route it back to
 * the ordinary intent path — its signer takes the path from the intent
 * (`fw:sign_custom_inputs.c:403-412`, the read at `:406`), never from the PSBT.
 *
 * Firmware citations: `fw:` = LedgerHQ/app-babylon-vault @ `b0c0ac4d`
 * (`develop`, app 0.10.1). Dispatch: `fw:sign_psbt_validate.c:3554-3723`;
 * Claim validator `:2369-2558`; WC validator `:2726-2887`; PayoutFinalize
 * validator `:3189-3494`; signing indices `fw:sign_custom_inputs.c:443-550`
 * (PayoutFinalize, input 1) and `:552-706` (standalone section, input 0).
 * The device requires ONE TAP_BIP32_DERIVATION entry keyed by the untweaked
 * key D inside the leaf, on the signed input (`:2440-2486`, `:2778-2818`,
 * `:3291-3336`); unlike the refund, no output entry is read — the device
 * derives P2TR(D) itself (`:2481-2485`, `:2813-2817`, `:3331-3335`).
 *
 * Deliberately NOT a validator. The device re-checks every term of these
 * transactions before it signs, and a rejection on any of their paths keeps
 * the loaded intent — the Assert's included: none of the firmware's six
 * `vault_context_invalidate` sites (`:742`, `:1481`, `:1487`, `:1773`,
 * `:2078`, `:2162`) lies on `:2369-2887` or `:3189-3494` — so a host-side
 * mirror of its rules would protect nothing and could only go stale. The host does the two things the
 * device cannot: decide whether ITS OWN intent gate applies, and put the
 * device's derivation entry on the right input.
 *
 * @module ledger-vault-signer/delegatedClaimPsbt
 */
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { assertBip86Path, bip86PathToString } from "./bip86Path";

const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;
const MASTER_FINGERPRINT_HEX_RE = /^[0-9a-f]{8}$/;

/** BIP-341 tapscript leaf version — the only one the device streams (`fw:sign_psbt_validate.c:313`). */
const TAPSCRIPT_LEAF_VERSION = 0xc0;
const X_ONLY_KEY_BYTES = 32;

// Script opcodes the firmware's dispatcher and validators compare against.
const OP_PUSHBYTES_1 = 0x01;
const OP_PUSHBYTES_2 = 0x02;
const OP_PUSHBYTES_32 = 0x20;
const OP_SIZE = 0x82;
const OP_EQUAL = 0x87;
const OP_EQUALVERIFY = 0x88;
const OP_SHA256 = 0xa8;
const OP_CHECKSIG = 0xac;
const OP_CHECKSIGVERIFY = 0xad;
const OP_CHECKSEQUENCEVERIFY = 0xb2;
/** `OP_TRUE`: the Assert leaf's terminator, what separates it from the `<t> OP_CSV` leaves. */
const OP_TRUE = 0x51;
const SCRIPT_NUM_SIGN_BIT = 0x80;

/** Leaf-byte offsets the firmware reads (`fw:vault_script.h:47-68`). */
const LEAF_KEY_OFFSET = 1;
const LEAF_AFTER_KEY_OFFSET = LEAF_KEY_OFFSET + X_ONLY_KEY_BYTES; // 33
/** `VAULT_DEPOSITOR_CLAIM_LEAF_LEN`: `<D> OP_CHECKSIG`. */
const CLAIM_LEAF_LEN = 1 + X_ONLY_KEY_BYTES + 1; // 34
/** `VAULT_NOPAYOUT_LEAF_LEN`; a payout leaf must be strictly longer. */
const NOPAYOUT_LEAF_LEN = 68;
/** `VAULT_LEAF_GROUP0_PUSH_OFF` / `VAULT_LEAF_GROUP0_OP_OFF`. */
const GROUP0_PUSH_OFFSET = 34;
const GROUP0_OP_OFFSET = 67;
/** The exact WC leaf length and its fixed opcode positions (`fw:sign_psbt_validate.c:2744-2755`). */
const WC_LEAF_LEN = 73;
const WC_SIZE_OFFSET = 34;
const WC_PUSH1_OFFSET = 35;
const WC_PUSH1_VALUE_OFFSET = 36;
const WC_EQUALVERIFY_OFFSET = 37;
const WC_SHA256_OFFSET = 38;
const WC_HASH_PUSH_OFFSET = 39;
const WC_EQUAL_OFFSET = 72;

/** `VAULT_PAYOUT_TIMELOCK_MIN/MAX` — the payout-leaf parser's inclusive band (`fw:vault_constants.h:112,115`). */
const PAYOUT_LEAF_T2_MIN = 90;
const PAYOUT_LEAF_T2_MAX = 4032;
/** Largest value a 1-byte CScriptNum push carries without a sign pad. */
const SCRIPT_NUM_ONE_BYTE_MAX = SCRIPT_NUM_SIGN_BIT - 1;

/**
 * What the host takes from a payout leaf: the signer key D. The CSV timelock
 * t2 decides whether the leaf is one at all, so it is read and range-checked,
 * but nothing acts on its value, so it is not returned.
 *
 * @experimental
 */
export interface PayoutLeafTerms {
  /** UNTWEAKED x-only key at leaf[1..33] (lowercase hex). */
  readonly leafKeyHex: string;
}

/**
 * Byte-for-byte mirror of the firmware's payout-leaf parser
 * (`fw:sign_psbt_validate_helpers.c:158-219`, `parse_payout_leaf_script`),
 * used by the PayoutFinalize validator on input 1: longer than the 68-byte
 * NoPayout leaf, `<D> OP_CHECKSIGVERIFY`, a first challenger group opening
 * with a 32-byte push at [34] and closing with OP_CHECKSIG at [67] (what
 * separates it from the Vault-UTXO leaf), and a `<t2> OP_CSV` tail where t2
 * is a 2-byte LE push with the sign bit clear or a 1-byte push, in
 * `[90, 4032]`. Returns `undefined` where the firmware returns false.
 *
 * Firmware quirk mirrored on purpose (raised with Ledger as KB Q22; never
 * code around it): the 2-byte branch is tried first and an out-of-band
 * 2-byte value falls through to the 1-byte branch, so a tail `02 01 5a b2`
 * (t2 = 23041) parses as t2 = 90 (`helpers.c:200-217`). Harmless for honest
 * builders: nSequence 90 can never satisfy that CSV.
 *
 * @experimental
 */
export function parsePayoutLeafScript(script: Uint8Array): PayoutLeafTerms | undefined {
  const len = script.length;
  if (len <= NOPAYOUT_LEAF_LEN) return undefined;
  if (script[0] !== OP_PUSHBYTES_32) return undefined;
  if (script[LEAF_AFTER_KEY_OFFSET] !== OP_CHECKSIGVERIFY) return undefined;
  if (script[len - 1] !== OP_CHECKSEQUENCEVERIFY) return undefined;
  if (script[GROUP0_PUSH_OFFSET] !== OP_PUSHBYTES_32) return undefined;
  if (script[GROUP0_OP_OFFSET] !== OP_CHECKSIG) return undefined;
  const leafKeyHex = Buffer.from(script.subarray(LEAF_KEY_OFFSET, LEAF_AFTER_KEY_OFFSET)).toString("hex");

  // 2-byte form first, then the 1-byte form — the firmware's order.
  if (script[len - 4] === OP_PUSHBYTES_2 && (script[len - 2] & SCRIPT_NUM_SIGN_BIT) === 0) {
    const csv = script[len - 3] | (script[len - 2] << 8);
    if (csv >= PAYOUT_LEAF_T2_MIN && csv <= PAYOUT_LEAF_T2_MAX) {
      return { leafKeyHex };
    }
  }
  if (script[len - 3] === OP_PUSHBYTES_1) {
    const csv = script[len - 2];
    if (csv >= PAYOUT_LEAF_T2_MIN && csv <= PAYOUT_LEAF_T2_MAX && csv <= SCRIPT_NUM_ONE_BYTE_MAX) {
      return { leafKeyHex };
    }
  }
  return undefined;
}

/**
 * The five delegated-claim shapes the host must tell apart: three standalone
 * (`claim`, `wronglyChallenged`, `payoutFinalize`), one intent-bound but
 * relabelled here (`assert`), one recognised only to be routed back to the
 * intent path (`payoutDepositor`).
 *
 * @experimental
 */
export type DelegatedClaimPsbtKind = "claim" | "wronglyChallenged" | "payoutFinalize" | "assert" | "payoutDepositor";

/**
 * The one input each validator signs — a literal per firmware branch, never
 * inferred from the PSBT (`fw:sign_custom_inputs.c:536-547` PayoutFinalize
 * signs 1; `:692-703` Claim/WC/Assert sign 0; `:403-405` the intent-bound
 * Payout signs 0).
 *
 * @experimental
 */
export const DELEGATED_CLAIM_SIGN_INPUT_INDEX: Readonly<Record<DelegatedClaimPsbtKind, number>> = {
  claim: 0,
  wronglyChallenged: 0,
  payoutFinalize: 1,
  assert: 0,
  payoutDepositor: 0,
};

/** What the host needs from a recognised shape: where to sign, and whose key the leaf names. */
interface DelegatedClaimPsbtTerms {
  readonly signInputIndex: number;
  /** UNTWEAKED x-only key at leaf[1..33] of the signed input (lowercase hex). */
  readonly leafKeyHex: string;
}

/** @experimental */
export type DelegatedClaimPsbtClassification =
  | (DelegatedClaimPsbtTerms & { readonly kind: "claim" })
  | (DelegatedClaimPsbtTerms & { readonly kind: "wronglyChallenged" })
  | (DelegatedClaimPsbtTerms & { readonly kind: "payoutFinalize" })
  | (DelegatedClaimPsbtTerms & { readonly kind: "assert" })
  | (DelegatedClaimPsbtTerms & { readonly kind: "payoutDepositor" });

/** Every dispatched transaction is v2 with locktime 0 (`fw:sign_psbt_validate.c:2374`, `:2573`, `:2731`, `:3191`). */
const MIN_TX_VERSION = 2;
const TX_LOCKTIME = 0;
const CLAIM_INPUT_COUNT = 1;
const CLAIM_OUTPUT_COUNT = 2;
const WC_INPUT_COUNT = 1;
const WC_OUTPUT_COUNT = 1;
const ASSERT_INPUT_COUNT = 1;
const PAYOUT_INPUT_COUNT = 2;
const PAYOUT_OUTPUT_COUNT = 2;
/** The PayoutFinalize input the device never signs or validates (`fw:sign_psbt_validate.c:3417-3419`). */
const PAYOUT_VAULT_INPUT = 0;

type PsbtInput = Psbt["data"]["inputs"][number];

/** The one tapscript leaf an input carries, or undefined (`fw:sign_psbt_validate.c:340-343` flags a second TAP_LEAF_SCRIPT as ambiguous; `:3514` and `:3539` reject it). */
function singleTapscriptLeaf(input: PsbtInput): Uint8Array | undefined {
  const leaves = input.tapLeafScript ?? [];
  if (leaves.length !== 1 || leaves[0].leafVersion !== TAPSCRIPT_LEAF_VERSION) {
    return undefined;
  }
  return leaves[0].script;
}

function isClaimLeaf(script: Uint8Array): boolean {
  return (
    script.length === CLAIM_LEAF_LEN && script[0] === OP_PUSHBYTES_32 && script[LEAF_AFTER_KEY_OFFSET] === OP_CHECKSIG
  );
}

/** The exact 73-byte layout the WC validator pins (`fw:sign_psbt_validate.c:2744-2755`). */
function isWcLeaf(script: Uint8Array): boolean {
  return (
    script.length === WC_LEAF_LEN &&
    script[0] === OP_PUSHBYTES_32 &&
    script[LEAF_AFTER_KEY_OFFSET] === OP_CHECKSIGVERIFY &&
    script[WC_SIZE_OFFSET] === OP_SIZE &&
    script[WC_PUSH1_OFFSET] === OP_PUSHBYTES_1 &&
    script[WC_PUSH1_VALUE_OFFSET] === X_ONLY_KEY_BYTES &&
    script[WC_EQUALVERIFY_OFFSET] === OP_EQUALVERIFY &&
    script[WC_SHA256_OFFSET] === OP_SHA256 &&
    script[WC_HASH_PUSH_OFFSET] === OP_PUSHBYTES_32 &&
    script[WC_EQUAL_OFFSET] === OP_EQUAL
  );
}

/**
 * `leaf_has_assert_shape` (`fw:sign_psbt_validate_helpers.c:221-232`): longer
 * than the 68-byte NoPayout leaf, `<D> OP_CHECKSIGVERIFY`, a first challenger
 * group opening with a 32-byte push at [34] and closing with OP_CHECKSIG at
 * [67], and OP_TRUE last — the WOTS verifier body's terminator, which no
 * `<t> OP_CSV` leaf has (btc-vault `connectors/claim_assert.rs:43-48`). The
 * device additionally pins the whole signer prefix to the loaded intent
 * (`assert_prefix_ok`, dispatch `:3710-3716`); that needs the intent and is
 * left to it.
 */
function isAssertLeaf(script: Uint8Array): boolean {
  return (
    script.length > NOPAYOUT_LEAF_LEN &&
    script[0] === OP_PUSHBYTES_32 &&
    script[LEAF_AFTER_KEY_OFFSET] === OP_CHECKSIGVERIFY &&
    script[GROUP0_PUSH_OFFSET] === OP_PUSHBYTES_32 &&
    script[GROUP0_OP_OFFSET] === OP_CHECKSIG &&
    script[script.length - 1] === OP_TRUE
  );
}

function leafKeyHexOf(script: Uint8Array): string {
  return Buffer.from(script.subarray(LEAF_KEY_OFFSET, LEAF_AFTER_KEY_OFFSET)).toString("hex");
}

/**
 * Classify a PSBT as one of the five delegated-claim shapes from the
 * PROVIDER'S OWN PARSE plus the caller's requested input index —
 * never from a caller flag. Anything else, including hex that does not
 * parse, returns `undefined`, so the caller's ordinary gates keep their
 * error precedence (the fail-safe direction: an unrecognised PSBT falls back
 * to requiring an approved intent).
 *
 * Shapes, all v2/locktime-0 (`fw:sign_psbt_validate.c:2374`, `:2731`, `:3191`):
 * - `claim`: 1 input, 2 outputs (`:2370`), input 0 leaf `<D> OP_CHECKSIG`
 *   of exactly 34 bytes (dispatch `:3677-3678`), requested index 0.
 * - `wronglyChallenged`: exactly 1 input, 1 output, input 0 leaf of exactly
 *   73 bytes with OP_SIZE at [34] (dispatch `:3681-3684`, layout
 *   `:2744-2755`), requested index 0. The validator itself admits more
 *   inputs (`:2727`, the wallet-policy route), but the dispatcher pre-routes
 *   3-in/1-out to NoPayout in any state (`:3592`) and, under an intent,
 *   2-in/non-2-out to Payout (`:3608-3610`) before the leaf dispatch, and
 *   btc-vault's WronglyChallenged is single-input (`wrongly_challenged.rs`),
 *   so only the one-input shape is the standalone WC this host signs.
 * - `payoutFinalize`: 2 inputs, 2 outputs (dispatch `:3659-3660`), input 1
 *   leaf parsed by {@link parsePayoutLeafScript}, requested index 1, AND
 *   input 0 carrying no leaf and no derivation entry for D — the shape the
 *   claimer builder emits: btc-vault `ac4954e7` (the rev the facade bundles,
 *   `build-wasm.js:19-24`) populates taproot metadata on `ASSERT_PAYOUT_INPUT`
 *   only (`transactions/payout.rs:449-466`; `psbt.rs:125-144` sets
 *   `witness_utxo` on every input, leaf and key origins on listed ones).
 *   The depositor Payout is the same unsigned transaction with a leaf on
 *   input 0 and the caller asking for index 0; the device separates the two
 *   by session state alone (`:3600-3644`), so without both host conditions
 *   the DEPOSITOR-shaped Payout could be waived here; under a loaded intent
 *   the device would then sign it at input 0 as the intent-bound Payout
 *   whatever index the caller asked for (`fw:sign_custom_inputs.c:403-405`)
 *   — a valid signature nobody requested. (The claimer-shaped one is never
 *   signed under an intent: the device refuses it and wipes the intent,
 *   `:1765-1775`.) A future builder that adds input-0 metadata makes this return
 *   `undefined`: fail-closed, but the standalone claimer Payout is then
 *   unavailable on Ledger — a red run to fix, not a compatible state.
 * - `payoutDepositor`: the same 2-in/2-out transaction with a leaf on input 0
 *   and requested index 0 — recognised so the provider can send it down the
 *   ordinary intent path unchanged, never relabelled here. Both leaves are
 *   required: btc-vault's depositor builder populates input 0 only
 *   (`payout.rs:268-273`, `psbt.rs:125-128` @ ac4954e7); input 1's payout
 *   leaf is there because the SDK copies it across (`payoutInputLeaf.ts`).
 *   A builder or SDK change that drops it makes this return `undefined` and
 *   the provider fail closed — look here first.
 * - `assert`: 1 input (`:2569`), requested index 0, input 0 leaf matching
 *   {@link isAssertLeaf}. No output count: the validator enforces none
 *   (`:2568-2714`). Intent-bound on the device (`assert_prefix_ok`), so the
 *   provider must gate it on a loaded intent; it comes through here only for
 *   the derivation entry the standalone signing section reads
 *   (`fw:sign_custom_inputs.c:624-661`).
 *
 * @experimental
 */
export function classifyDelegatedClaimPsbt(
  psbtHex: string,
  requestedInputIndex: number,
): DelegatedClaimPsbtClassification | undefined {
  let psbt: Psbt;
  try {
    psbt = Psbt.fromHex(psbtHex);
  } catch {
    return undefined;
  }
  if (psbt.version < MIN_TX_VERSION || psbt.locktime !== TX_LOCKTIME) {
    return undefined;
  }
  const inputCount = psbt.data.inputs.length;
  const outputCount = psbt.data.outputs.length;

  if (inputCount === PAYOUT_INPUT_COUNT && outputCount === PAYOUT_OUTPUT_COUNT) {
    const leaf = singleTapscriptLeaf(psbt.data.inputs[DELEGATED_CLAIM_SIGN_INPUT_INDEX.payoutFinalize]);
    if (leaf === undefined) return undefined;
    const terms = parsePayoutLeafScript(leaf);
    if (terms === undefined) return undefined;
    const vaultInput = psbt.data.inputs[PAYOUT_VAULT_INPUT];
    if (requestedInputIndex === DELEGATED_CLAIM_SIGN_INPUT_INDEX.payoutDepositor) {
      const vaultLeaf = singleTapscriptLeaf(vaultInput);
      if (vaultLeaf === undefined || vaultLeaf[0] !== OP_PUSHBYTES_32 || vaultLeaf.length <= LEAF_AFTER_KEY_OFFSET) {
        return undefined;
      }
      return {
        kind: "payoutDepositor",
        signInputIndex: DELEGATED_CLAIM_SIGN_INPUT_INDEX.payoutDepositor,
        leafKeyHex: leafKeyHexOf(vaultLeaf),
      };
    }
    if (requestedInputIndex !== DELEGATED_CLAIM_SIGN_INPUT_INDEX.payoutFinalize) {
      return undefined;
    }
    if ((vaultInput.tapLeafScript ?? []).length > 0) return undefined;
    if ((vaultInput.tapBip32Derivation ?? []).some((e) => e.pubkey.toString("hex") === terms.leafKeyHex)) {
      return undefined;
    }
    return {
      kind: "payoutFinalize",
      signInputIndex: DELEGATED_CLAIM_SIGN_INPUT_INDEX.payoutFinalize,
      leafKeyHex: terms.leafKeyHex,
    };
  }

  if (requestedInputIndex !== DELEGATED_CLAIM_SIGN_INPUT_INDEX.claim) {
    return undefined;
  }
  const leaf = singleTapscriptLeaf(psbt.data.inputs[DELEGATED_CLAIM_SIGN_INPUT_INDEX.claim]);
  if (leaf === undefined) return undefined;

  if (inputCount === CLAIM_INPUT_COUNT && outputCount === CLAIM_OUTPUT_COUNT && isClaimLeaf(leaf)) {
    return { kind: "claim", signInputIndex: DELEGATED_CLAIM_SIGN_INPUT_INDEX.claim, leafKeyHex: leafKeyHexOf(leaf) };
  }
  if (inputCount === ASSERT_INPUT_COUNT && isAssertLeaf(leaf)) {
    return { kind: "assert", signInputIndex: DELEGATED_CLAIM_SIGN_INPUT_INDEX.assert, leafKeyHex: leafKeyHexOf(leaf) };
  }
  if (inputCount === WC_INPUT_COUNT && outputCount === WC_OUTPUT_COUNT && isWcLeaf(leaf)) {
    return {
      kind: "wronglyChallenged",
      signInputIndex: DELEGATED_CLAIM_SIGN_INPUT_INDEX.wronglyChallenged,
      leafKeyHex: leafKeyHexOf(leaf),
    };
  }
  return undefined;
}

/** @experimental */
export interface AugmentPsbtForDelegatedClaimParams {
  /** The kind the caller classified; re-classified here and must agree. */
  readonly kind: DelegatedClaimPsbtKind;
  readonly psbtHex: string;
  /** The connected device's depositor x-only key (64 lowercase hex). */
  readonly depositorXOnlyHex: string;
  /** The device's master fingerprint (8 lowercase hex). */
  readonly masterFingerprintHex: string;
  /** The depositor's 5-level BIP-86 path. */
  readonly depositorPath: readonly number[];
}

/**
 * Put the one TAP_BIP32_DERIVATION entry the device requires on the SIGNED
 * input: keyed by the untweaked D, carrying the master fingerprint and the
 * BIP-86 path (`fw:sign_psbt_validate.c:2440-2486`, `:2658-2680`, `:2778-2818`,
 * `:3291-3336`). The WASM builders already emit an entry for D with a zero
 * fingerprint and an empty path (`btc-vault crates/vault/src/psbt.rs:65-75`),
 * which the device would read and reject, and which bip174 refuses to add a
 * second entry beside (`bip174@2.1.1 src/lib/converter/shared/bip32Derivation.js:70-75`),
 * so any existing entry for D is REPLACED; entries for other keys stay. No
 * output entry is written — these validators derive P2TR(D) themselves
 * (`:2481-2485`, `:2813-2817`, `:3331-3335`). `leafHashes: []` is fine: the
 * device's value parser skips the hashes (`fw:sign_psbt_validate_helpers.c:59-60`).
 * Re-classifies internally; augmenting anything that is not this device's
 * PSBT of the stated kind is a caller bug. Every other term is the device's
 * to validate (module doc). Never touches the
 * unsigned transaction.
 *
 * @experimental
 */
export function augmentPsbtForDelegatedClaim(params: AugmentPsbtForDelegatedClaimParams): string {
  const { kind, psbtHex, depositorXOnlyHex, masterFingerprintHex, depositorPath } = params;
  if (!X_ONLY_HEX_RE.test(depositorXOnlyHex)) {
    throw new Error("depositorXOnlyHex must be 64 lowercase hex characters");
  }
  if (!MASTER_FINGERPRINT_HEX_RE.test(masterFingerprintHex)) {
    throw new Error("masterFingerprintHex must be 8 lowercase hex characters (the 4-byte master fingerprint)");
  }
  assertBip86Path("depositorPath", depositorPath);
  if (kind === "payoutDepositor") {
    throw new Error(
      "payoutDepositor needs no derivation entry — the device takes its path from the intent; sign it through signPsbt",
    );
  }
  const classified = classifyDelegatedClaimPsbt(psbtHex, DELEGATED_CLAIM_SIGN_INPUT_INDEX[kind]);
  if (classified === undefined || classified.kind !== kind) {
    throw new Error(`not a ${kind}-shaped PSBT for input ${DELEGATED_CLAIM_SIGN_INPUT_INDEX[kind]}`);
  }
  if (classified.leafKeyHex !== depositorXOnlyHex) {
    throw new Error(`${kind} leaf key does not equal the depositor key — this device cannot sign this PSBT`);
  }
  const psbt = Psbt.fromHex(psbtHex);
  const input = psbt.data.inputs[classified.signInputIndex];
  // Replace the whole set, not only D's entry: the builder writes one
  // zero-fingerprint entry per signing key — D plus every challenger on the
  // claimer Payout (`psbt.rs:65-75` @ ac4954e7) — no host consumer reads them
  // (the SDK extracts tapScriptSig only), and the firmware's tested shape
  // carries D's entry alone (`tests_test_sign_psbt_validate.py:1078-1084`).
  input.tapBip32Derivation = undefined;
  psbt.updateInput(classified.signInputIndex, {
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
