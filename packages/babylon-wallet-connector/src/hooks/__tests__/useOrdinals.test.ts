import { afterEach, describe, expect, it, vi } from "vitest";

import type { IBTCProvider, UTXO } from "@/core/types";

import { fetchOrdinals, OrdinalsClassifierUnavailableError } from "../useOrdinals";

const ORDINALS_API_URL = "https://ordinals.test";
const ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const UTXO_ABOVE_DUST: UTXO = {
  txid: "5e".repeat(32),
  vout: 1,
  value: 50_000,
  scriptPubKey: "",
};

// A shape a wallet could return in breach of the `getInscriptions` contract.
const NON_ARRAY_ANSWER = { list: [], total: 0 };

function providerResolving(answer: unknown): IBTCProvider {
  return { getInscriptions: async () => answer } as unknown as IBTCProvider;
}

describe("fetchOrdinals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // These tests keep the default wallet timeout on purpose: with 0 the settled
  // timeout wins the race, and even a wallet that answers would reach the API.

  it("falls back to the ordinals API when the wallet resolves a non-array", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                txid: UTXO_ABOVE_DUST.txid,
                vout: UTXO_ABOVE_DUST.vout,
                inscription: true,
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const inscriptions = await fetchOrdinals({
      address: ADDRESS,
      utxos: [UTXO_ABOVE_DUST],
      btcProvider: providerResolving(NON_ARRAY_ANSWER),
      ordinalsApiUrl: ORDINALS_API_URL,
    });

    expect(inscriptions).toEqual([
      { txid: UTXO_ABOVE_DUST.txid, vout: UTXO_ABOVE_DUST.vout },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws the classifier-unavailable error when the wallet resolves a non-array and no API URL is set", async () => {
    await expect(
      fetchOrdinals({
        address: ADDRESS,
        utxos: [UTXO_ABOVE_DUST],
        btcProvider: providerResolving(NON_ARRAY_ANSWER),
      }),
    ).rejects.toBeInstanceOf(OrdinalsClassifierUnavailableError);
  });

  it("treats an empty wallet array as an answer and does not call the ordinals API", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const inscriptions = await fetchOrdinals({
      address: ADDRESS,
      utxos: [UTXO_ABOVE_DUST],
      btcProvider: providerResolving([]),
      ordinalsApiUrl: ORDINALS_API_URL,
    });

    expect(inscriptions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
