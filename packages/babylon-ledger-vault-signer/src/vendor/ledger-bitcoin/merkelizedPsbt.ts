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
 *                  symmetric count guards in the constructor — the input/output
 *                  map counts must equal the declared PSBT_GLOBAL_*_COUNTs in
 *                  BOTH directions (upstream TypeErrors on missing maps and
 *                  silently ignores surplus ones; valid PSBTs unchanged), plus
 *                  the per-index strict-null guard the strict tsconfig needs;
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

    const inputCount = this.getGlobalInputCount();
    // LOCAL ADDITION: symmetric count guard — psbt.copy already copied surplus
    // maps, so serialize() would emit maps the commitment never covers.
    if (this.inputMaps.length !== inputCount) {
      throw new Error(`Input map count ${this.inputMaps.length} != declared PSBT_GLOBAL_INPUT_COUNT ${inputCount}`);
    }
    for (let i = 0; i < inputCount; i++) {
      const inputMap = this.inputMaps[i];
      if (inputMap === undefined) {
        throw new Error(`Missing input map ${i}`);
      }
      this.inputMerkleMaps.push(MerkelizedPsbt.createMerkleMap(inputMap));
    }
    this.inputMapCommitments = this.inputMerkleMaps.map((v) => v.commitment());

    const outputCount = this.getGlobalOutputCount();
    if (this.outputMaps.length !== outputCount) {
      throw new Error(`Output map count ${this.outputMaps.length} != declared PSBT_GLOBAL_OUTPUT_COUNT ${outputCount}`);
    }
    for (let i = 0; i < outputCount; i++) {
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
