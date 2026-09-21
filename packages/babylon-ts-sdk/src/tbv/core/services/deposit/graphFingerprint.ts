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
 * `bitcoin::Transaction`. `serializeGraphTx` re-encodes the latter so both
 * paths hash identical bytes. The layout matches
 * `canonical_tx_set_fingerprint` in `btc-vault`
 * (`crates/depositor-cli/src/recovery_graph.rs`), so a fingerprint taken here
 * equals the one the reference CLI computes for the same graph.
 *
 * Note this commits to the transaction set only. `gc_wots_keys`, the verifying
 * key, and the typed connector metadata are deliberately outside it — the spec
 * binds those at activation by other means.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { stripHexPrefix } from "../../primitives/utils/bitcoin";

/** One challenger's contribution to the fingerprint. */
export interface ChallengerFingerprintPart {
  /** Challenger x-only pubkey, hex, no prefix. */
  pubkey: string;
  /** The challenger's NoPayout transaction, consensus-serialized. */
  nopayoutTx: Uint8Array;
  /** Per-GC output label hashes, hex, in the order the graph lists them. */
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

class ByteWriter {
  private readonly parts: Uint8Array[] = [];

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
  }

  u32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value, true);
    this.parts.push(buf);
  }

  i32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setInt32(0, value, true);
    this.parts.push(buf);
  }

  /**
   * Bitcoin amounts are u64. They stay well inside `Number.MAX_SAFE_INTEGER`
   * (21e6 BTC is ~2.1e15 sats), so a JSON number is lossless here, but the
   * encoding still has to fill all eight bytes.
   */
  u64(value: number): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, BigInt(value), true);
    this.parts.push(buf);
  }

  varint(value: number): void {
    if (value < 0xfd) {
      this.parts.push(Uint8Array.of(value));
    } else if (value <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = 0xfd;
      new DataView(buf.buffer).setUint16(1, value, true);
      this.parts.push(buf);
    } else if (value <= 0xffffffff) {
      const buf = new Uint8Array(5);
      buf[0] = 0xfe;
      new DataView(buf.buffer).setUint32(1, value, true);
      this.parts.push(buf);
    } else {
      const buf = new Uint8Array(9);
      buf[0] = 0xff;
      new DataView(buf.buffer).setBigUint64(1, BigInt(value), true);
      this.parts.push(buf);
    }
  }

  varBytes(bytes: Uint8Array): void {
    this.varint(bytes.length);
    this.parts.push(bytes);
  }

  concat(): Uint8Array {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
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

function asInt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new GraphFingerprintError(`Graph tx ${path} is not an integer`);
  }
  return value;
}

function asHexBytes(value: unknown, path: string): Uint8Array {
  if (typeof value !== "string") {
    throw new GraphFingerprintError(`Graph tx ${path} is not a hex string`);
  }
  const hex = stripHexPrefix(value);
  if (hex.length % 2 !== 0 || (hex.length > 0 && !/^[0-9a-fA-F]+$/.test(hex))) {
    throw new GraphFingerprintError(`Graph tx ${path} is not valid hex`);
  }
  return hex.length === 0 ? new Uint8Array() : hexToBytes(hex.toLowerCase());
}

/**
 * Re-encode one serde-serialized `bitcoin::Transaction` from a `tx_graph_json`
 * node into consensus bytes.
 *
 * Mirrors `bitcoin::consensus::serialize`: version, the segwit marker/flag when
 * any input carries a witness, inputs, outputs, each input's witness stack, then
 * lock time. `previous_output` arrives as `"<txid>:<vout>"` in display byte
 * order, so the txid is reversed back to internal order on the wire.
 */
export function serializeGraphTx(txNode: unknown, path: string): Uint8Array {
  const tx = asRecord(txNode, path);
  const inputs = asArray(field(tx, "input", path), `${path}.input`);
  const outputs = asArray(field(tx, "output", path), `${path}.output`);

  const witnesses = inputs.map((input, i) =>
    asArray(
      asRecord(input, `${path}.input[${i}]`).witness ?? [],
      `${path}.input[${i}].witness`,
    ).map((item, j) =>
      asHexBytes(item, `${path}.input[${i}].witness[${j}]`),
    ),
  );
  const segwit = witnesses.some((stack) => stack.length > 0);

  const w = new ByteWriter();
  w.i32(asInt(field(tx, "version", path), `${path}.version`));
  if (segwit) {
    w.push(Uint8Array.of(0x00, 0x01));
  }

  w.varint(inputs.length);
  inputs.forEach((input, i) => {
    const at = `${path}.input[${i}]`;
    const node = asRecord(input, at);
    const outpoint = field(node, "previous_output", at);
    if (typeof outpoint !== "string") {
      throw new GraphFingerprintError(`Graph tx ${at}.previous_output is not a string`);
    }
    const [txid, voutText] = outpoint.split(":");
    const txidBytes = asHexBytes(txid ?? "", `${at}.previous_output.txid`);
    if (txidBytes.length !== 32) {
      throw new GraphFingerprintError(`Graph tx ${at}.previous_output txid is not 32 bytes`);
    }
    // Display order is the reverse of the wire order.
    w.push(txidBytes.slice().reverse());
    const vout = Number(voutText);
    if (!Number.isInteger(vout) || vout < 0) {
      throw new GraphFingerprintError(`Graph tx ${at}.previous_output has no vout`);
    }
    w.u32(vout);
    w.varBytes(asHexBytes(node.script_sig ?? "", `${at}.script_sig`));
    w.u32(asInt(field(node, "sequence", at), `${at}.sequence`));
  });

  w.varint(outputs.length);
  outputs.forEach((output, i) => {
    const at = `${path}.output[${i}]`;
    const node = asRecord(output, at);
    w.u64(asInt(field(node, "value", at), `${at}.value`));
    w.varBytes(asHexBytes(field(node, "script_pubkey", at), `${at}.script_pubkey`));
  });

  if (segwit) {
    for (const stack of witnesses) {
      w.varint(stack.length);
      for (const item of stack) {
        w.varBytes(item);
      }
    }
  }

  w.u32(asInt(field(tx, "lock_time", path), `${path}.lock_time`));
  return w.concat();
}

/**
 * Hash the canonical transaction set.
 *
 * Challengers are sorted by pubkey so the digest does not depend on map or
 * response ordering, which neither side controls consistently.
 */
export function canonicalTxSetFingerprint(set: CanonicalTxSet): string {
  const w = new ByteWriter();
  for (const tx of [set.peginTx, set.claimTx, set.assertTx, set.payoutTx]) {
    w.push(tx);
  }

  const sorted = [...set.challengers].sort((a, b) =>
    normalizePubkey(a.pubkey) < normalizePubkey(b.pubkey) ? -1 : 1,
  );
  for (const challenger of sorted) {
    const pubkey = hexToBytes(normalizePubkey(challenger.pubkey));
    if (pubkey.length !== 32) {
      throw new GraphFingerprintError(
        `Challenger pubkey ${challenger.pubkey} is not 32 bytes`,
      );
    }
    w.push(pubkey);
    w.push(challenger.nopayoutTx);
    for (const hash of challenger.outputLabelHashes) {
      const bytes = asHexBytes(hash, "output_label_hashes");
      if (bytes.length !== 32) {
        throw new GraphFingerprintError(
          "Graph output_label_hashes entry is not 32 bytes",
        );
      }
      w.push(bytes);
    }
  }

  return bytesToHex(sha256(w.concat()));
}

function normalizePubkey(pubkey: string): string {
  return stripHexPrefix(pubkey).toLowerCase();
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
    peginTx: asHexBytes(args.peginTxHex, "pegin_tx"),
    claimTx: asHexBytes(args.claimTxHex, "claim_tx"),
    assertTx: asHexBytes(args.assertTxHex, "assert_tx"),
    payoutTx: asHexBytes(args.payoutTxHex, "payout_tx"),
    challengers: args.challengers.map((c) => ({
      pubkey: c.challenger_pubkey,
      nopayoutTx: asHexBytes(c.nopayout_tx?.tx_hex, "nopayout_tx"),
      outputLabelHashes: c.output_label_hashes ?? [],
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
        ).map((h, i) => {
          if (typeof h !== "string") {
            throw new GraphFingerprintError(
              `Graph tx ${at}.output_label_hashes[${i}] is not a hex string`,
            );
          }
          return h;
        }),
      };
    }),
  });
}
