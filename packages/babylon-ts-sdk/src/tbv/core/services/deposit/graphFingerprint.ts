/**
 * Deterministic fingerprint over the canonical transaction set of a
 * depositor-as-claimer graph.
 *
 * `btc-vault/docs/pegin.md` §5.9 (TRV-013) makes this the depositor's binding
 * between the two moments where it gives up leverage:
 *
 * - **Presign** — before signing the VP's PSBTs, fingerprint the transaction
 *   set the VP just supplied and persist it.
 * - **Activation** — before revealing the HTLC secret, fingerprint the graph
 *   the VP returns and require an exact match.
 *
 * Without this, a VP can serve one graph to sign and a different one to
 * activate against; every check in `assertBundleBoundToVault` compares the
 * bundle only against public values it also controls.
 *
 * The two moments carry the same transactions in different encodings — presign
 * hands back raw consensus `tx_hex`, activation a serde-serialized
 * `bitcoin::Transaction`. Both sides decode strictly and re-serialize through
 * `bitcoinjs-lib`, so each hashed part is exactly one canonical transaction.
 * That matters because the layout below has no length prefixes: it matches
 * `canonical_tx_set_fingerprint` in `btc-vault`
 * (`crates/depositor-cli/src/recovery_graph.rs`), which relies on the same
 * strict decode. Hashing undecoded bytes would let a VP shift bytes between
 * parts and reach the same digest with a different graph.
 *
 * Note this commits to the transaction set only. `gc_wots_keys`, the verifying
 * key, and the typed connector metadata are deliberately outside it — the spec
 * binds those at activation by other means.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import { Transaction } from "bitcoinjs-lib";

import {
  canonicalizeBtcPubkey,
  stripHexPrefix,
} from "../../primitives/utils/bitcoin";

/** Lowercase hex, whole bytes, no prefix: the only form serde emits. */
const SERDE_HEX_RE = /^(?:[0-9a-f]{2})*$/;
/** An x-only pubkey or a SHA-256 digest in serde hex. */
const BYTES32_SERDE_HEX_RE = /^[0-9a-f]{64}$/;
/** `bitcoin::OutPoint` in serde: display-order txid, `:`, decimal vout. */
const OUTPOINT_RE = /^([0-9a-f]{64}):(0|[1-9][0-9]*)$/;

const INT32_MIN = -0x8000_0000;
const INT32_MAX = 0x7fff_ffff;
const UINT32_MAX = 0xffff_ffff;

/** One challenger's contribution to the fingerprint. */
export interface ChallengerFingerprintPart {
  /** Challenger x-only pubkey, lowercase hex, no prefix. */
  pubkey: string;
  /** The challenger's NoPayout transaction, consensus-serialized. */
  nopayoutTx: Uint8Array;
  /** Per-GC output label hashes, lowercase hex, in the order the graph lists them. */
  outputLabelHashes: string[];
}

/** The four transactions every depositor-as-claimer graph carries. */
export interface CanonicalTxSet {
  peginTx: Uint8Array;
  claimTx: Uint8Array;
  assertTx: Uint8Array;
  payoutTx: Uint8Array;
  challengers: ChallengerFingerprintPart[];
}

export class GraphFingerprintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphFingerprintError";
  }
}

function field(node: Record<string, unknown>, name: string, path: string) {
  const value = node[name];
  if (value === undefined) {
    throw new GraphFingerprintError(`Graph tx ${path} is missing "${name}"`);
  }
  return value;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new GraphFingerprintError(`Graph tx ${path} is not an array`);
  }
  return value;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GraphFingerprintError(`Graph tx ${path} is not an object`);
  }
  return value as Record<string, unknown>;
}

function asInt(value: unknown, path: string, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new GraphFingerprintError(
      `Graph tx ${path} is not an integer in [${min}, ${max}]`,
    );
  }
  return value;
}

function asSerdeHex(value: unknown, path: string): Buffer {
  if (typeof value !== "string" || !SERDE_HEX_RE.test(value)) {
    throw new GraphFingerprintError(
      `Graph tx ${path} is not lowercase hex without a prefix`,
    );
  }
  return Buffer.from(value, "hex");
}

function asSerdeBytes32(value: unknown, path: string): string {
  if (typeof value !== "string" || !BYTES32_SERDE_HEX_RE.test(value)) {
    throw new GraphFingerprintError(
      `Graph ${path} is not 32 bytes of lowercase hex`,
    );
  }
  return value;
}

/**
 * Re-encode one serde-serialized `bitcoin::Transaction` from a `tx_graph_json`
 * node into consensus bytes.
 *
 * Every field is required and range-checked: a value that serde would reject
 * or read differently must not reach the digest, or the depositor could match
 * a graph that the recovery tooling cannot load. `previous_output` arrives in
 * display byte order, so the txid is reversed back to wire order.
 */
export function serializeGraphTx(txNode: unknown, path: string): Uint8Array {
  const node = asRecord(txNode, path);
  const tx = new Transaction();
  tx.version = asInt(
    field(node, "version", path),
    `${path}.version`,
    INT32_MIN,
    INT32_MAX,
  );
  tx.locktime = asInt(
    field(node, "lock_time", path),
    `${path}.lock_time`,
    0,
    UINT32_MAX,
  );

  asArray(field(node, "input", path), `${path}.input`).forEach((input, i) => {
    const at = `${path}.input[${i}]`;
    const inputNode = asRecord(input, at);
    const outpoint = field(inputNode, "previous_output", at);
    const match = typeof outpoint === "string" && OUTPOINT_RE.exec(outpoint);
    if (!match) {
      throw new GraphFingerprintError(
        `Graph tx ${at}.previous_output is not "<txid>:<vout>"`,
      );
    }
    const vout = asInt(Number(match[2]), `${at}.previous_output vout`, 0, UINT32_MAX);
    tx.addInput(
      Buffer.from(match[1], "hex").reverse(),
      vout,
      asInt(field(inputNode, "sequence", at), `${at}.sequence`, 0, UINT32_MAX),
      asSerdeHex(field(inputNode, "script_sig", at), `${at}.script_sig`),
    );
    tx.ins[i].witness = asArray(
      field(inputNode, "witness", at),
      `${at}.witness`,
    ).map((item, j) => asSerdeHex(item, `${at}.witness[${j}]`));
  });

  asArray(field(node, "output", path), `${path}.output`).forEach((output, i) => {
    const at = `${path}.output[${i}]`;
    const outputNode = asRecord(output, at);
    tx.addOutput(
      asSerdeHex(field(outputNode, "script_pubkey", at), `${at}.script_pubkey`),
      asInt(field(outputNode, "value", at), `${at}.value`, 0, Number.MAX_SAFE_INTEGER),
    );
  });

  return new Uint8Array(tx.toBuffer());
}

/**
 * Decode one presign `tx_hex` strictly and return its canonical bytes.
 *
 * Rejects trailing bytes and any encoding that does not round-trip, so the
 * part hashed below is exactly one transaction.
 */
function decodePresignTx(txHex: string, path: string): Uint8Array {
  const hex = stripHexPrefix(txHex).toLowerCase();
  let tx: Transaction;
  try {
    tx = Transaction.fromHex(hex);
  } catch (err) {
    throw new GraphFingerprintError(
      `Presign ${path} is not one transaction: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (tx.toHex() !== hex) {
    throw new GraphFingerprintError(
      `Presign ${path} is not a canonical transaction encoding`,
    );
  }
  return new Uint8Array(tx.toBuffer());
}

/**
 * Hash the canonical transaction set.
 *
 * Challengers are sorted by pubkey so the digest does not depend on map or
 * response ordering, which neither side controls consistently. Two entries
 * for one key are rejected: with the order between them undefined, the digest
 * would follow whichever order the VP chose.
 */
export function canonicalTxSetFingerprint(set: CanonicalTxSet): string {
  const sorted = [...set.challengers].sort((a, b) =>
    a.pubkey < b.pubkey ? -1 : a.pubkey > b.pubkey ? 1 : 0,
  );
  const parts = [set.peginTx, set.claimTx, set.assertTx, set.payoutTx];
  sorted.forEach((challenger, i) => {
    const pubkey = asSerdeBytes32(challenger.pubkey, "challenger pubkey");
    if (i > 0 && sorted[i - 1].pubkey === pubkey) {
      throw new GraphFingerprintError(`Graph lists challenger ${pubkey} twice`);
    }
    parts.push(hexToBytes(pubkey), challenger.nopayoutTx);
    for (const hash of challenger.outputLabelHashes) {
      parts.push(hexToBytes(asSerdeBytes32(hash, "output_label_hashes entry")));
    }
  });

  return bytesToHex(sha256(concatBytes(...parts)));
}

/**
 * Fingerprint the transaction set a VP supplied at presign.
 *
 * `peginTxHex` comes from the depositor's own signing context, not the
 * response — the presign payload carries no PegIn transaction, and taking it
 * from the VP would let the VP choose both sides of the comparison.
 */
export function fingerprintPresignTxSet(args: {
  peginTxHex: string;
  claimTxHex: string;
  assertTxHex: string;
  payoutTxHex: string;
  challengers: {
    challenger_pubkey: string;
    nopayout_tx: { tx_hex: string };
    output_label_hashes: string[];
  }[];
}): string {
  return canonicalTxSetFingerprint({
    peginTx: decodePresignTx(args.peginTxHex, "pegin_tx"),
    claimTx: decodePresignTx(args.claimTxHex, "claim_tx"),
    assertTx: decodePresignTx(args.assertTxHex, "assert_tx"),
    payoutTx: decodePresignTx(args.payoutTxHex, "payout_tx"),
    challengers: args.challengers.map((c) => ({
      pubkey: canonicalizeBtcPubkey(c.challenger_pubkey),
      nopayoutTx: decodePresignTx(c.nopayout_tx.tx_hex, "nopayout_tx"),
      outputLabelHashes: c.output_label_hashes.map((hash) =>
        stripHexPrefix(hash).toLowerCase(),
      ),
    })),
  });
}

/**
 * Fingerprint the graph a VP returned at activation, parsed from
 * `tx_graph_json`.
 */
export function fingerprintReturnedGraph(
  graph: Record<string, unknown>,
): string {
  const tx = (key: string) =>
    serializeGraphTx(asRecord(field(graph, key, "graph"), key).tx, key);

  const subgraphs = asRecord(
    field(graph, "challenger_subgraphs", "graph"),
    "challenger_subgraphs",
  );

  return canonicalTxSetFingerprint({
    peginTx: tx("pegin_tx"),
    claimTx: tx("claim_tx"),
    assertTx: tx("assert_tx"),
    payoutTx: tx("payout_tx"),
    challengers: Object.entries(subgraphs).map(([pubkey, value]) => {
      const at = `challenger_subgraphs[${pubkey}]`;
      const sub = asRecord(value, at);
      return {
        pubkey,
        nopayoutTx: serializeGraphTx(
          asRecord(field(sub, "nopayout_tx", at), `${at}.nopayout_tx`).tx,
          `${at}.nopayout_tx`,
        ),
        outputLabelHashes: asArray(
          field(sub, "output_label_hashes", at),
          `${at}.output_label_hashes`,
        ).map((h, i) =>
          asSerdeBytes32(h, `${at}.output_label_hashes[${i}]`),
        ),
      };
    }),
  });
}
