/**
 * Vendored from the Ledger Bitcoin JS client (Apache-2.0).
 *
 * Upstream:        https://github.com/LedgerHQ/app-bitcoin (formerly app-bitcoin-new)
 * File:            bitcoin_client_js/src/lib/merkelizedPsbt.ts
 * Version:         ledger-bitcoin@0.3.0 (npm gitHead 0a9e9e141f3340d29e7c6181177d4e5e9483a9f7)
 * Upstream sha256: 13293618532c43452df6dd0400443b11b7ae453e116ed604a0afb07c9726fb3c
 * Vendored:        2026-08-14
 * License:         Apache-2.0 — see ./LICENSE (verbatim upstream copy)
 * Modifications:   explicit `import { Buffer } from "buffer"` (no implicit Node
 *                  global — this package ships to the browser); the commitment
 *                  lists map over the arrays directly (upstream's
 *                  `[...maps.values()].map` spread was a no-op on an Array);
 *                  defensive strict-null guard on per-index map access in the
 *                  constructor (a count/maps mismatch now throws a typed Error
 *                  instead of upstream's raw TypeError; valid PSBTs unchanged);
 *                  formatting.
 */

import { Buffer } from "buffer";

import { MerkleMap } from "./merkleMap";
import { PsbtV2 } from "./psbtv2";

/**
 * This class merkelizes a PSBTv2, by merkelizing the different
 * maps of the psbt. This is used during the transaction signing process,
 * where the hardware app can request specific parts of the psbt from the
 * client code and be sure that the response data actually belong to the psbt.
 * The reason for this is the limited amount of memory available to the app,
 * so it can't always store the full psbt in memory.
 *
 * The signing process is documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md#sign_psbt
 */
export class MerkelizedPsbt extends PsbtV2 {
  public readonly globalMerkleMap: MerkleMap;
  public inputMerkleMaps: MerkleMap[] = [];
  public outputMerkleMaps: MerkleMap[] = [];
  public inputMapCommitments: Buffer[];
  public outputMapCommitments: Buffer[];
  constructor(psbt: PsbtV2) {
    super();
    psbt.copy(this);
    this.globalMerkleMap = MerkelizedPsbt.createMerkleMap(this.globalMap);

    for (let i = 0; i < this.getGlobalInputCount(); i++) {
      const inputMap = this.inputMaps[i];
      if (inputMap === undefined) {
        throw new Error(`Missing input map ${i}`);
      }
      this.inputMerkleMaps.push(MerkelizedPsbt.createMerkleMap(inputMap));
    }
    this.inputMapCommitments = this.inputMerkleMaps.map((v) => v.commitment());

    for (let i = 0; i < this.getGlobalOutputCount(); i++) {
      const outputMap = this.outputMaps[i];
      if (outputMap === undefined) {
        throw new Error(`Missing output map ${i}`);
      }
      this.outputMerkleMaps.push(MerkelizedPsbt.createMerkleMap(outputMap));
    }
    this.outputMapCommitments = this.outputMerkleMaps.map((v) => v.commitment());
  }
  // These public functions are for MerkelizedPsbt.
  getGlobalSize(): number {
    return this.globalMap.size;
  }
  getGlobalKeysValuesRoot(): Buffer {
    return this.globalMerkleMap.commitment();
  }

  private static createMerkleMap(map: ReadonlyMap<string, Buffer>): MerkleMap {
    // Default code-unit sort == byte-lexicographic order for the lowercase-hex
    // keys — the single order serializeMap, MerkleMap, and the device enforce
    // (base app check_merkle_tree_sorted.c).
    const sortedKeysStrings = [...map.keys()].sort();
    const values = sortedKeysStrings.map((k) => {
      const v = map.get(k);
      if (!v) {
        throw new Error("No value for key " + k);
      }
      return v;
    });
    const sortedKeys = sortedKeysStrings.map((k) => Buffer.from(k, "hex"));

    return new MerkleMap(sortedKeys, values);
  }
}
