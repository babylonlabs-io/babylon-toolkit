/**
 * SIGN_PSBT synchronous data-prep pipeline (#2219 B1-c).
 *
 * Everything is computed before the first APDU: after prepare, each loop round
 * is Map/Set lookups plus vendored interpreter arithmetic only — the device
 * arms a 50-tick (~5 s) continue deadline (`base:io_ext.h:28`), so nothing in
 * a round may wait on anything but the transport. Any throw here means zero
 * device I/O.
 *
 * Every `base:` citation resolves at `LedgerHQ/app-bitcoin` branch `baseapp`
 * @ `e400d8d8`, the `bitcoin_app_base` rev `app-babylon-vault` pins — earlier
 * revs of that branch differ (`has_no_wallet_policy` is absent at `132d911`).
 *
 * @module ledger-vault-signer/signPsbtPrepare
 */

import { Psbt as BitcoinjsPsbt, Transaction as BitcoinjsTransaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { LedgerSignPsbtProtocolError } from "./errors";
import {
  buildExpectedSignatureTable,
  createYieldCollector,
  type ExpectedSignatureTable,
  type YieldCollector,
} from "./expectedSignatures";
import type { Apdu } from "./rawApdu";
import { CLA_APP } from "./vaultCommands";
import { ClientCommandInterpreter } from "./vendor/ledger-bitcoin/clientCommands";
import { MerkelizedPsbt } from "./vendor/ledger-bitcoin/merkelizedPsbt";
import { hashLeaf, Merkle } from "./vendor/ledger-bitcoin/merkle";
import { DefaultWalletPolicy } from "./vendor/ledger-bitcoin/policy";
import { PsbtV2 } from "./vendor/ledger-bitcoin/psbtv2";
import { createVarint } from "./vendor/ledger-bitcoin/varint";
import type { DefaultTaprootWalletPolicy } from "./walletPolicy";

/** Base app SIGN_PSBT instruction (`base:commands.h`). */
const INS_SIGN_PSBT = 0x04;
const P1_SIGN_PSBT = 0x00;
/**
 * Protocol v1 (`base:constants.h:25`) — the YIELD augmented-pubkey block the
 * collector asserts on exists only under v1 (`base:sign_input.c:68-76`).
 */
const P2_PROTOCOL_V1 = 0x01;

/** `wallet_id` and `wallet_hmac` are each 32 bytes (`base:init_global_state.c:63-114`). */
const WALLET_FIELD_BYTES = 32;
/**
 * No-policy mode: an all-zero `wallet_id` routes into the vault validators
 * (`has_no_wallet_policy`, `base:init_global_state.c:192-198`), which treat
 * every input/output as external — nothing is marked internal because both
 * preprocess passes return early on that flag (`base:preprocess_inputs.c:66-68`,
 * `base:preprocess_outputs.c:54-56`). A non-zero id without the policy preimages
 * seeded would make the device ask for an unknown preimage mid-loop — policy
 * mode seeds them.
 */
const NO_WALLET_POLICY_ID = new Uint8Array(WALLET_FIELD_BYTES);
/**
 * Derived apps have no registered policies, so all-zero is the only sendable
 * hmac: a non-zero one is refused with SW_NOT_SUPPORTED
 * (`base:init_global_state.c:184-187`), REGISTER_WALLET is a stub
 * (`base:register_wallet.c:27-33`), and the app declares no SLIP-21 policy
 * path (`base:Makefile:58-81`).
 */
const NO_WALLET_POLICY_HMAC = new Uint8Array(WALLET_FIELD_BYTES);

const DEPOSITOR_X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;
const PSBT_HEX_RE = /^(?:[0-9a-fA-F]{2})+$/;
const WALLET_ID_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * The commitment surface of the vendored `MerkelizedPsbt` the header builder
 * consumes — structural, so no vendored symbol reaches the emitted
 * declarations (vendor d.ts is excluded from dist; see `vite.config.ts`).
 */
interface SignPsbtCommitments {
  readonly inputMapCommitments: readonly Buffer[];
  readonly outputMapCommitments: readonly Buffer[];
  getGlobalKeysValuesRoot(): Buffer;
  getGlobalInputCount(): number;
  getGlobalOutputCount(): number;
}

/**
 * The one interpreter surface the loop drives (vendored
 * `ClientCommandInterpreter`, typed structurally for the same reason as
 * {@link SignPsbtCommitments}).
 */
export interface SignPsbtInterpreter {
  execute(request: Buffer): Buffer;
}

/**
 * SIGN_PSBT client data, parsed by the device in this exact order
 * (`base:init_global_state.c:63-114`):
 * `globalCommitment ‖ varint(nIn) ‖ inputsRoot(32) ‖ varint(nOut) ‖
 * outputsRoot(32) ‖ walletId(32) ‖ walletHmac(32)`.
 * Built from parts — never assert a fixed length (varints grow past 252).
 */
function buildSignPsbtCdata(merkelized: SignPsbtCommitments, walletId: Uint8Array): Uint8Array {
  // Outer trees hash each per-map COMMITMENT as a 0x00-prefixed leaf
  // (`js:appClient.ts:317-325`; consumed at `base:get_merkleized_map.c:20-39`).
  const inputsRoot = new Merkle(merkelized.inputMapCommitments.map((commitment) => hashLeaf(commitment))).getRoot();
  const outputsRoot = new Merkle(merkelized.outputMapCommitments.map((commitment) => hashLeaf(commitment))).getRoot();
  return Uint8Array.from(
    Buffer.concat([
      merkelized.getGlobalKeysValuesRoot(),
      createVarint(merkelized.getGlobalInputCount()),
      inputsRoot,
      createVarint(merkelized.getGlobalOutputCount()),
      outputsRoot,
      Buffer.from(walletId),
      // Derived apps have no registered policies: the hmac is all-zero for the
      // default policy too (`base:init_global_state.c:184-187`).
      Buffer.from(NO_WALLET_POLICY_HMAC),
    ]),
  );
}

/** The initial SIGN_PSBT APDU: `E1 04 00 01 ‖ cdata` (`js:appClient.ts:85-92`). */
export function buildSignPsbtApdu(cdata: Uint8Array): Apdu {
  return { cla: CLA_APP, ins: INS_SIGN_PSBT, p1: P1_SIGN_PSBT, p2: P2_PROTOCOL_V1, data: cdata };
}

/** BIP-341 SIGHASH_DEFAULT (0x00) — the only type any vault flow signs (wire spec §5). */
const SIGHASH_DEFAULT = 0;

/**
 * An explicit non-default PSBT_IN_SIGHASH_TYPE on an input this round signs
 * would make the device sign it and append the sighash byte
 * (`base:sign_input.c:197-201`) — the 65-byte yield then dies at the
 * collector's length check AFTER the user approved. Reject before any I/O.
 */
function assertDefaultSighashTypes(mergeTarget: BitcoinjsPsbt, table: ExpectedSignatureTable): void {
  for (const [inputIndex] of table.byInput) {
    const sighashType = mergeTarget.data.inputs[inputIndex].sighashType;
    if (sighashType !== undefined && sighashType !== SIGHASH_DEFAULT) {
      throw new LedgerSignPsbtProtocolError(
        `input ${inputIndex} requests sighash type ${sighashType}, but vault flows sign SIGHASH_DEFAULT only`,
      );
    }
  }
}

/**
 * Reject an input already carrying a signature this round would collide with.
 * bip174 refuses a duplicate (pubkey, leafHash) tapScriptSig and any second
 * tapKeySig (`bip174@2.1.1` `converter/input/tapScriptSig.js:52-63`,
 * `tapKeySig.js:32-35`) — but only at merge, long after the user approved on
 * device. Retrying with an already-signed PSBT is the realistic trigger.
 */
function assertNoConflictingSignatures(mergeTarget: BitcoinjsPsbt, table: ExpectedSignatureTable): void {
  for (const [inputIndex, expectation] of table.byInput) {
    const input = mergeTarget.data.inputs[inputIndex];
    // A finalized input is silently signable: bip174 has no finalized guard, so
    // the merge writes the partial sig ALONGSIDE the final witness instead of
    // throwing — and nothing downstream notices: extraction reads the merged
    // tapScriptSig fine (`peginInput.ts:233-240`) and `finalizePeginInputPsbt`'s
    // allFinalized fallback (`peginInput.ts:272-292`) then ships the STALE
    // witness. Reject here, where a throw still costs zero device I/O.
    if (input.finalScriptWitness || input.finalScriptSig) {
      throw new LedgerSignPsbtProtocolError(
        `input ${inputIndex} is already finalized and this round signs it — pass an unsigned PSBT`,
      );
    }
    if (expectation.kind === "tapscript") {
      // Same (key, leaf) notion the table and bip174's dupe set both key on.
      const conflicts = input.tapScriptSig?.some(
        (existing) =>
          existing.pubkey.toString("hex") === expectation.expectedSignerXOnlyHex &&
          expectation.expectedLeafHashHexes.has(existing.leafHash.toString("hex")),
      );
      if (conflicts) {
        throw new LedgerSignPsbtProtocolError(
          `input ${inputIndex} already carries a tapScriptSig for a (key, leaf) we sign — pass an unsigned PSBT`,
        );
      }
      continue;
    }
    if (input.tapKeySig) {
      throw new LedgerSignPsbtProtocolError(
        `input ${inputIndex} already carries a tapKeySig and this round signs its keypath — pass an unsigned PSBT`,
      );
    }
  }
}

export interface PrepareSignPsbtParams {
  /** v0 PSBT hex from the SDK builders. */
  readonly psbtHex: string;
  /** Cached GET_EXTENDED_PUBKEY read (64 lowercase hex) — pins the table. */
  readonly depositorXOnlyHex: string;
  /**
   * Wallet-policy mode: the SIGN_PSBT wallet_id becomes the policy id and the
   * interpreter serves the policy preimages. Required for key-path signing
   * (PoP, Pre-PegIn): without a policy the base app skips `sign_internal_inputs`
   * (`base:sign_psbt.c:142-148`) and the device answers SW_OK with no yield
   * (`app-babylon-vault/src/sign_custom_inputs.c:101-107` @ 4decf822). Omit for
   * the no-policy tapscript flows.
   */
  readonly walletPolicy?: DefaultTaprootWalletPolicy;
}

declare const preparedSignPsbtBrand: unique symbol;

/**
 * Opaque handle from `prepareSignPsbt`: only `table` and `unsignedTxid` are
 * public — the live ceremony state (interpreter, collector, cdata) is held
 * module-privately so external callers cannot touch or serialize it.
 */
export interface PreparedSignPsbt {
  /** The expected-signature table, for pre-I/O policy checks and progress totals. */
  readonly table: ExpectedSignatureTable;
  /** Display-order txid of the unsigned tx — a stable signing-request identity. */
  readonly unsignedTxid: string;
  readonly [preparedSignPsbtBrand]: true;
}

interface PreparedSignPsbtState {
  readonly cdata: Uint8Array;
  /** Seeded; onYield wired to the collector. Single-use ceremony state. */
  readonly interpreter: SignPsbtInterpreter;
  /** Owns table + seen set + per-YIELD/completion assertions. */
  readonly collector: YieldCollector;
  /** Merge target — the v0 bytes, untouched. */
  readonly originalPsbtHex: string;
}

const preparedStates = new WeakMap<PreparedSignPsbt, PreparedSignPsbtState>();

/** @internal Package-only: assemble a prepared handle over explicit ceremony state. */
export function makePreparedSignPsbt(
  publicPart: { table: ExpectedSignatureTable; unsignedTxid: string },
  state: PreparedSignPsbtState,
): PreparedSignPsbt {
  const prepared = { ...publicPart } as PreparedSignPsbt;
  preparedStates.set(prepared, state);
  return prepared;
}

/** @internal Package-only: resolve the ceremony state behind a prepared handle. */
export function getPreparedSignPsbtState(prepared: PreparedSignPsbt): PreparedSignPsbtState {
  const state = preparedStates.get(prepared);
  if (!state) {
    throw new LedgerSignPsbtProtocolError("unrecognised prepared signing state — use prepareSignPsbt's return value");
  }
  return state;
}

/**
 * Deserialize → normalize v0→v2 → merkelize → expected-signature table →
 * already-signed gate → seeded interpreter → cdata. Pure and synchronous;
 * throws typed `LedgerSignPsbtProtocolError` on every rejection, all before any
 * device I/O.
 */
export function prepareSignPsbt(params: PrepareSignPsbtParams): PreparedSignPsbt {
  const { psbtHex, depositorXOnlyHex, walletPolicy } = params;
  if (!DEPOSITOR_X_ONLY_HEX_RE.test(depositorXOnlyHex)) {
    throw new LedgerSignPsbtProtocolError("depositorXOnlyHex must be 64 lowercase hex characters");
  }
  // Value import only — the vendored type never appears in an exported signature.
  let vendorPolicy: DefaultWalletPolicy | undefined;
  if (walletPolicy !== undefined) {
    if (!WALLET_ID_HEX_RE.test(walletPolicy.walletIdHex)) {
      throw new LedgerSignPsbtProtocolError("walletPolicy.walletIdHex must be 64 lowercase hex characters");
    }
    vendorPolicy = new DefaultWalletPolicy(walletPolicy.descriptorTemplate, walletPolicy.keyInfo);
    // The header ships walletIdHex but the interpreter seeds preimages keyed on
    // template+keyInfo, so a mismatch dies untyped mid-loop, after device I/O.
    if (vendorPolicy.getId().toString("hex") !== walletPolicy.walletIdHex) {
      throw new LedgerSignPsbtProtocolError("walletPolicy.walletIdHex does not match sha256 of the serialized policy");
    }
  }
  // Buffer.from(hex) silently truncates at the first invalid character.
  if (!PSBT_HEX_RE.test(psbtHex)) {
    throw new LedgerSignPsbtProtocolError("psbtHex is not even-length hexadecimal");
  }

  // The merge stage folds signatures back via bitcoinjs Psbt — assert
  // parseability BEFORE any device I/O so a PsbtV2-acceptable-but-
  // bitcoinjs-rejected PSBT cannot burn an approved intent and then fail.
  let mergeTarget: BitcoinjsPsbt;
  try {
    mergeTarget = BitcoinjsPsbt.fromHex(psbtHex);
  } catch (error) {
    throw new LedgerSignPsbtProtocolError(
      `PSBT rejected at parse (merge target): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const psbt = new PsbtV2();
  try {
    // Parses the v0 unsigned tx for counts, then normalizeToV2 synthesizes the
    // v2 fields and deletes UNSIGNED_TX; unknown keys (all taproot fields)
    // pass through byte-identical (`psbtv2.ts` deserialize/normalizeToV2).
    psbt.deserialize(Buffer.from(psbtHex, "hex"));
  } catch (error) {
    throw new LedgerSignPsbtProtocolError(
      `PSBT rejected at parse: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let merkelized: MerkelizedPsbt;
  let table: ExpectedSignatureTable;
  try {
    merkelized = new MerkelizedPsbt(psbt);
    // Table from the SAME instance that was committed — no re-parse gap.
    table = buildExpectedSignatureTable({ psbt: merkelized, depositorXOnlyHex });
  } catch (error) {
    // Totalize the typed contract: already-typed rejections pass through;
    // anything else (vendored reader throws, bitcoinjs point math) is wrapped.
    if (error instanceof LedgerSignPsbtProtocolError) throw error;
    throw new LedgerSignPsbtProtocolError(
      `PSBT rejected at preflight: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertNoConflictingSignatures(mergeTarget, table);
  assertDefaultSighashTypes(mergeTarget, table);
  const collector = createYieldCollector(table);

  // ONE yield mechanism: the onYield seam — the loop never parses YIELDs.
  const interpreter = new ClientCommandInterpreter(undefined, (payload) => collector.assertAndRecord(payload));
  // Reference composition: the stock client's signPsbt seeding — the map/list
  // preimages both modes need; the policy preimages are seeded below.
  interpreter.addKnownMapping(merkelized.globalMerkleMap);
  for (const inputMap of merkelized.inputMerkleMaps) {
    interpreter.addKnownMapping(inputMap);
  }
  for (const outputMap of merkelized.outputMerkleMaps) {
    interpreter.addKnownMapping(outputMap);
  }
  interpreter.addKnownList(merkelized.inputMapCommitments);
  interpreter.addKnownList(merkelized.outputMapCommitments);

  // Policy mode: the device fetches the policy serialization, then walks the
  // key-info tree and the template (`base:sign_psbt.c` wallet header checks)
  // before signing internal inputs. Seed all three preimages (vendored
  // `addKnownWalletPolicy`); no-policy mode seeds nothing and keeps wallet_id zero.
  const walletId = walletPolicy ? Buffer.from(walletPolicy.walletIdHex, "hex") : NO_WALLET_POLICY_ID;
  if (vendorPolicy) {
    interpreter.addKnownWalletPolicy(vendorPolicy);
  }

  // The brand is type-only; forged objects miss the WeakMap and die typed.
  return makePreparedSignPsbt(
    { table, unsignedTxid: BitcoinjsTransaction.fromBuffer(mergeTarget.data.globalMap.unsignedTx.toBuffer()).getId() },
    { cdata: buildSignPsbtCdata(merkelized, walletId), interpreter, collector, originalPsbtHex: psbtHex },
  );
}
