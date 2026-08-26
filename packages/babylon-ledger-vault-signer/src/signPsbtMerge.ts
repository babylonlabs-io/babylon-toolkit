/**
 * Fold collected SIGN_PSBT yields into the ORIGINAL v0 PSBT (#2219).
 *
 * CRITICAL PATH (CLAUDE.md §7): signature fields only — the unsigned tx is
 * never rewritten, and this package NEVER finalizes. The SDK's far-side checks
 * (`assertPsbtUnsignedTxMatches`, signature extraction,
 * `assertScriptPathSchnorrSignature`) run unchanged on the returned hex, and
 * `peginInput.ts` rejects finalized PSBTs outright. bip174's converters give a
 * free integrity backstop: a duplicate (pubkey, leafHash) tapScriptSig or a
 * pre-existing tapKeySig throws instead of being silently overwritten
 * (verified in `bip174@2.1.1` `converter/input/tapScriptSig.js:52-63`,
 * `tapKeySig.js:32-35`).
 *
 * @module ledger-vault-signer/signPsbtMerge
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type { CollectedYield } from "./expectedSignatures";

/**
 * Write each yield into the PSBT it was collected for: tapscript →
 * `tapScriptSig[{ pubkey, leafHash, signature }]`, keypath → `tapKeySig`.
 * Kind-driven — no per-flow switch. Completion is asserted by the collector
 * BEFORE this is called; the caller finalizes, never this function.
 */
export function mergeYields(originalPsbtHex: string, yields: readonly CollectedYield[]): string {
  const psbt = Psbt.fromHex(originalPsbtHex);
  for (const yielded of yields) {
    if (yielded.kind === "tapscript") {
      psbt.updateInput(yielded.inputIndex, {
        tapScriptSig: [
          {
            pubkey: Buffer.from(yielded.signerXOnlyHex, "hex"),
            leafHash: Buffer.from(yielded.leafHashHex, "hex"),
            signature: Buffer.from(yielded.signature),
          },
        ],
      });
    } else {
      psbt.updateInput(yielded.inputIndex, { tapKeySig: Buffer.from(yielded.signature) });
    }
  }
  return psbt.toHex();
}
