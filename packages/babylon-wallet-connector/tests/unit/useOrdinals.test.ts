import { expect, test } from "@playwright/test";

import type { IBTCProvider, UTXO } from "../../src/core/types";
import { fetchOrdinals, OrdinalsClassifierUnavailableError } from "../../src/hooks/useOrdinals";

const createUtxo = (txid: string, vout: number, value = 100_000): UTXO => ({
  txid,
  vout,
  value,
  scriptPubKey: "0014abc123",
});

const createProvider = (getInscriptions: IBTCProvider["getInscriptions"]): IBTCProvider =>
  ({
    getInscriptions,
  }) as IBTCProvider;

test.describe("fetchOrdinals", () => {
  test("returns wallet inscriptions when getInscriptions succeeds without API fallback", async () => {
    const inscriptions = [{ txid: "tx1", vout: 0 }];
    const result = await fetchOrdinals({
      address: "bc1qtest",
      utxos: [createUtxo("tx1", 0)],
      btcProvider: createProvider(async () => inscriptions),
    });

    expect(result).toEqual(inscriptions);
  });

  test("treats an empty wallet inscription list as a successful classification", async () => {
    const result = await fetchOrdinals({
      address: "bc1qtest",
      utxos: [createUtxo("tx1", 0)],
      btcProvider: createProvider(async () => []),
    });

    expect(result).toEqual([]);
  });

  test("throws classifier-unavailable when wallet rejects and no API URL is configured", async () => {
    await expect(
      fetchOrdinals({
        address: "bc1qtest",
        utxos: [createUtxo("tx1", 0)],
        btcProvider: createProvider(async () => {
          throw new Error("INSCRIPTIONS_UNSUPPORTED_NETWORK");
        }),
      }),
    ).rejects.toBeInstanceOf(OrdinalsClassifierUnavailableError);
  });

  test("throws classifier-unavailable when wallet times out and no API URL is configured", async () => {
    await expect(
      fetchOrdinals({
        address: "bc1qtest",
        utxos: [createUtxo("tx1", 0)],
        btcProvider: createProvider(() => new Promise<never>(() => undefined)),
        walletTimeout: 0,
      }),
    ).rejects.toBeInstanceOf(OrdinalsClassifierUnavailableError);
  });

  test("throws classifier-unavailable when no wallet classifier or API URL is configured", async () => {
    await expect(
      fetchOrdinals({
        address: "bc1qtest",
        utxos: [createUtxo("tx1", 0)],
      }),
    ).rejects.toBeInstanceOf(OrdinalsClassifierUnavailableError);
  });
});
