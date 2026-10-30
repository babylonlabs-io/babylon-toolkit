import { describe, expect, it } from "vitest";

import type { InscriptionIdentifier, UTXO } from "@/core/types";

import { filterInscriptionUtxos } from "../utxoFiltering";

// The genesis coinbase txid. It contains hex letters, so its upper- and
// lowercase spellings differ.
const TXID_LOWER =
  "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
const TXID_UPPER = TXID_LOWER.toUpperCase();

describe("filterInscriptionUtxos", () => {
  it("flags a UTXO listed with an uppercase txid when the inscription verdict is lowercase", () => {
    const utxo: UTXO = {
      txid: TXID_UPPER,
      vout: 0,
      value: 50_000,
      scriptPubKey: "0014abc123",
    };
    const inscriptions: InscriptionIdentifier[] = [
      { txid: TXID_LOWER, vout: 0 },
    ];

    const { availableUtxos, inscriptionUtxos } = filterInscriptionUtxos(
      [utxo],
      inscriptions,
    );

    expect(inscriptionUtxos).toEqual([utxo]);
    expect(availableUtxos).toEqual([]);
  });

  it("flags a UTXO listed with a lowercase txid when the inscription verdict is uppercase", () => {
    const utxo: UTXO = {
      txid: TXID_LOWER,
      vout: 0,
      value: 50_000,
      scriptPubKey: "0014abc123",
    };
    const inscriptions: InscriptionIdentifier[] = [
      { txid: TXID_UPPER, vout: 0 },
    ];

    const { availableUtxos, inscriptionUtxos } = filterInscriptionUtxos(
      [utxo],
      inscriptions,
    );

    expect(inscriptionUtxos).toEqual([utxo]);
    expect(availableUtxos).toEqual([]);
  });

  it("skips a verdict whose txid is not a string and still applies the others", () => {
    const utxo: UTXO = {
      txid: TXID_LOWER,
      vout: 0,
      value: 50_000,
      scriptPubKey: "0014abc123",
    };
    // Verdicts reach the filter unvalidated from the wallet or the ordinals
    // API, so a malformed one must not throw.
    const inscriptions: InscriptionIdentifier[] = [
      { txid: null as unknown as string, vout: 0 },
      { txid: TXID_LOWER, vout: 0 },
    ];

    const { availableUtxos, inscriptionUtxos } = filterInscriptionUtxos(
      [utxo],
      inscriptions,
    );

    expect(inscriptionUtxos).toEqual([utxo]);
    expect(availableUtxos).toEqual([]);
  });

  it("flags a UTXO when the wallet returns the verdict's vout as a string", () => {
    const utxo: UTXO = {
      txid: TXID_LOWER,
      vout: 1,
      value: 50_000,
      scriptPubKey: "0014abc123",
    };
    // UniSat, OKX and OneKey build the verdict from `output.split(":")`, so
    // vout arrives as a string despite the declared number type.
    const inscriptions: InscriptionIdentifier[] = [
      { txid: TXID_LOWER, vout: "1" as unknown as number },
    ];

    const { availableUtxos, inscriptionUtxos } = filterInscriptionUtxos(
      [utxo],
      inscriptions,
    );

    expect(inscriptionUtxos).toEqual([utxo]);
    expect(availableUtxos).toEqual([]);
  });
});
