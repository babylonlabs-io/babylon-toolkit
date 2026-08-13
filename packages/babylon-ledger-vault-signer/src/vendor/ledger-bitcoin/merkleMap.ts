/**
 * Vendored from the Ledger Bitcoin JS client (Apache-2.0).
 *
 * Upstream:        https://github.com/LedgerHQ/app-bitcoin (formerly app-bitcoin-new)
 * File:            bitcoin_client_js/src/lib/merkleMap.ts
 * Version:         ledger-bitcoin@0.3.0 (npm gitHead 0a9e9e141f3340d29e7c6181177d4e5e9483a9f7)
 * Upstream sha256: 39c5058d58c0dcbbbf2b11a736da4da741d1ba4d740ec959b412a7fbcc4b2956
 * Vendored:        2026-08-13
 * License:         Apache-2.0 — see ./LICENSE (verbatim upstream copy)
 * Modifications:   explicit `import { Buffer } from "buffer"`; two
 *                  `(keys[i] as Buffer)` narrowings in the strictly-increasing
 *                  key check (loop-bounded, behaviour-preserving); formatting.
 *
 * Merkelized maps: two Merkle trees of equal shape (keys, values); the
 * commitment is `varint(n) ‖ keysRoot ‖ valuesRoot`. Keys must be strictly
 * increasing (byte-lexicographic).
 */

import { Buffer } from "buffer";

import { hashLeaf, Merkle } from "./merkle";
import { createVarint } from "./varint";

export class MerkleMap {
  readonly keys: readonly Buffer[];
  readonly keysTree: Merkle;
  readonly values: readonly Buffer[];
  readonly valuesTree: Merkle;
  /**
   * @param keys Sorted list of (unhashed) keys
   * @param values values, in corresponding order as the keys, and of equal length
   */
  constructor(keys: readonly Buffer[], values: readonly Buffer[]) {
    if (keys.length != values.length) {
      throw new Error("keys and values should have the same length");
    }

    // Sanity check: verify that keys are actually sorted and with no duplicates
    for (let i = 0; i < keys.length - 1; i++) {
      if ((keys[i] as Buffer).toString("hex") >= (keys[i + 1] as Buffer).toString("hex")) {
        throw new Error("keys must be in strictly increasing order");
      }
    }

    this.keys = keys;
    this.keysTree = new Merkle(keys.map((k) => hashLeaf(k)));
    this.values = values;
    this.valuesTree = new Merkle(values.map((v) => hashLeaf(v)));
  }

  commitment(): Buffer {
    // returns a buffer between 65 and 73 (included) bytes long
    return Buffer.concat([createVarint(this.keys.length), this.keysTree.getRoot(), this.valuesTree.getRoot()]);
  }
}
