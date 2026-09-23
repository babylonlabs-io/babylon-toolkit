import { describe, expect, it } from "vitest";

import type { InscriptionIdentifier, UTXO } from "@/core/types";

import { filterInscriptionUtxos } from "../utxoFiltering";

describe("filterInscriptionUtxos", () => {
  it("returns the caller's UTXO objects, not copies, so fields beyond UTXO survive", () => {
    // A consumer annotates each UTXO with the key that owns it and reads that
    // annotation back after filtering. The filter must partition the objects
    // it was given, never rebuild them to the UTXO shape.
    const owned: UTXO & { internalPubkeyHex: string } = {
      txid: "ab".repeat(32),
      vout: 0,
      value: 50_000,
      scriptPubKey: "5120" + "11".repeat(32),
      internalPubkeyHex: "aa".repeat(32),
    };
    const inscribed: UTXO & { internalPubkeyHex: string } = {
      txid: "cd".repeat(32),
      vout: 1,
      value: 546,
      scriptPubKey: "5120" + "22".repeat(32),
      internalPubkeyHex: "bb".repeat(32),
    };
    const inscriptions: InscriptionIdentifier[] = [{ txid: inscribed.txid, vout: inscribed.vout }];

    const { availableUtxos, inscriptionUtxos } = filterInscriptionUtxos([owned, inscribed], inscriptions);

    expect(availableUtxos).toHaveLength(1);
    expect(availableUtxos[0]).toBe(owned);
    expect(inscriptionUtxos).toHaveLength(1);
    expect(inscriptionUtxos[0]).toBe(inscribed);
  });
});
