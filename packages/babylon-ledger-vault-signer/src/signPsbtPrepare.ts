/**
 * SIGN_PSBT synchronous data-prep pipeline (#2219 B1-c).
 *
 * Everything is computed before the first APDU: after prepare, each loop round
 * is Map/Set lookups plus vendored interpreter arithmetic only — the device
 * arms a 50-tick (~5 s) continue deadline (`base:io_ext.h:28`), so nothing in
 * a round may wait on anything but the transport. Any throw here means zero
 * device I/O.
 *
 * @module ledger-vault-signer/signPsbtPrepare
 */

import { Psbt as BitcoinjsPsbt } from "bitcoinjs-lib";
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
import { PsbtV2 } from "./vendor/ledger-bitcoin/psbtv2";
import { createVarint } from "./vendor/ledger-bitcoin/varint";

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

const DEPOSITOR_X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;
const PSBT_HEX_RE = /^(?:[0-9a-fA-F]{2})+$/;

/**
 * #2221/#2222 seam. Both fields default to 32 zero bytes: all-zero `wallet_id`
 * routes into the vault validators (`has_no_wallet_policy`,
 * `base:init_global_state.c:192-198`), and a non-zero `wallet_hmac` is
 * `SW_NOT_SUPPORTED` — B1 hard-zeroes both.
 */
export interface SignPsbtHeaderOptions {
  readonly walletId?: Uint8Array;
  readonly walletHmac?: Uint8Array;
}

/**
 * The commitment surface of the vendored `MerkelizedPsbt` the header builder
 * consumes — structural, so no vendored symbol reaches the emitted
 * declarations (vendor d.ts is excluded from dist; see `vite.config.ts`).
 */
export interface SignPsbtCommitments {
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
export function buildSignPsbtCdata(merkelized: SignPsbtCommitments, options?: SignPsbtHeaderOptions): Uint8Array {
  const walletId = options?.walletId ?? new Uint8Array(WALLET_FIELD_BYTES);
  const walletHmac = options?.walletHmac ?? new Uint8Array(WALLET_FIELD_BYTES);
  if (walletId.length !== WALLET_FIELD_BYTES || walletHmac.length !== WALLET_FIELD_BYTES) {
    throw new LedgerSignPsbtProtocolError(
      `walletId and walletHmac must be ${WALLET_FIELD_BYTES} bytes (got ${walletId.length}/${walletHmac.length})`,
    );
  }
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
      Buffer.from(walletHmac),
    ]),
  );
}

/** The initial SIGN_PSBT APDU: `E1 04 00 01 ‖ cdata` (`js:appClient.ts:85-92`). */
export function buildSignPsbtApdu(cdata: Uint8Array): Apdu {
  return { cla: CLA_APP, ins: INS_SIGN_PSBT, p1: P1_SIGN_PSBT, p2: P2_PROTOCOL_V1, data: cdata };
}

export interface PrepareSignPsbtParams {
  /** v0 PSBT hex from the SDK builders. */
  readonly psbtHex: string;
  /** Cached GET_EXTENDED_PUBKEY read (64 lowercase hex) — pins the table. */
  readonly depositorXOnlyHex: string;
}

export interface PreparedSignPsbt {
  readonly cdata: Uint8Array;
  /** Seeded; onYield wired to the collector. Discard on abort — never reuse. */
  readonly interpreter: SignPsbtInterpreter;
  /** Owns table + seen set + per-YIELD/completion assertions. */
  readonly collector: YieldCollector;
  /** The collector's table, exposed for tests and progress totals. */
  readonly table: ExpectedSignatureTable;
  /** Merge target — the v0 bytes, untouched. */
  readonly originalPsbtHex: string;
}

/**
 * Deserialize → normalize v0→v2 → merkelize → expected-signature table →
 * seeded interpreter → cdata. Pure and synchronous; throws typed
 * `LedgerSignPsbtProtocolError` on every rejection, all before any device I/O.
 */
export function prepareSignPsbt(params: PrepareSignPsbtParams): PreparedSignPsbt {
  const { psbtHex, depositorXOnlyHex } = params;
  if (!DEPOSITOR_X_ONLY_HEX_RE.test(depositorXOnlyHex)) {
    throw new LedgerSignPsbtProtocolError("depositorXOnlyHex must be 64 lowercase hex characters");
  }
  // Buffer.from(hex) silently truncates at the first invalid character.
  if (!PSBT_HEX_RE.test(psbtHex)) {
    throw new LedgerSignPsbtProtocolError("psbtHex is not even-length hex");
  }

  // The merge stage folds signatures back via bitcoinjs Psbt — assert
  // parseability BEFORE any device I/O so a PsbtV2-acceptable-but-
  // bitcoinjs-rejected PSBT cannot burn an approved intent and then fail.
  try {
    BitcoinjsPsbt.fromHex(psbtHex);
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
  const collector = createYieldCollector(table);

  // ONE yield mechanism: the onYield seam — the loop never parses YIELDs.
  const interpreter = new ClientCommandInterpreter(undefined, (payload) => collector.assertAndRecord(payload));
  // Reference composition: the stock client's signPsbt seeding. NO policy
  // registration — B1 is no-policy mode only (wallet_id = 32×00).
  interpreter.addKnownMapping(merkelized.globalMerkleMap);
  for (const inputMap of merkelized.inputMerkleMaps) {
    interpreter.addKnownMapping(inputMap);
  }
  for (const outputMap of merkelized.outputMerkleMaps) {
    interpreter.addKnownMapping(outputMap);
  }
  interpreter.addKnownList(merkelized.inputMapCommitments);
  interpreter.addKnownList(merkelized.outputMapCommitments);

  return {
    cdata: buildSignPsbtCdata(merkelized),
    interpreter,
    collector,
    table,
    originalPsbtHex: psbtHex,
  };
}
