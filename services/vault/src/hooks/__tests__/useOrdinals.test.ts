/**
 * Tests for the vault's useOrdinals wrapper — specifically that the inscription
 * check only runs where it can produce an answer.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBTCNetwork } from "@/config/network";

import { useOrdinals } from "../useOrdinals";

const { mockBaseOrdinals } = vi.hoisted(() => ({
  mockBaseOrdinals: vi.fn(() => ({
    inscriptions: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useOrdinals: mockBaseOrdinals,
  useChainConnector: vi.fn(() => ({
    connectedWallet: {
      provider: { getInscriptions: vi.fn() },
      account: { address: "bc1qtest" },
    },
  })),
}));

vi.mock("@/config/network", () => ({
  BTC_MAINNET: "mainnet",
  getBTCNetwork: vi.fn(),
}));

const utxos = [
  { txid: "txid1", vout: 0, value: 100_000, scriptPubKey: "0014abcd" },
];

/** The `enabled` flag the wrapper handed to the underlying query. */
function enabledFlag(): boolean {
  return mockBaseOrdinals.mock.calls.at(-1)?.[3].enabled;
}

describe("useOrdinals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the check on mainnet", () => {
    vi.mocked(getBTCNetwork).mockReturnValue("mainnet");

    renderHook(() => useOrdinals(utxos));

    expect(enabledFlag()).toBe(true);
  });

  it("skips the check on signet, where no wallet will report inscriptions", () => {
    // Every enabled wallet throws INSCRIPTIONS_UNSUPPORTED_NETWORK off mainnet
    // and there is no signet ordinals API, so running it would only ever error —
    // producing a permanent "couldn't verify" notice on devnet.
    vi.mocked(getBTCNetwork).mockReturnValue("signet");

    renderHook(() => useOrdinals(utxos));

    expect(enabledFlag()).toBe(false);
  });

  it("still honors an explicit disable on mainnet", () => {
    vi.mocked(getBTCNetwork).mockReturnValue("mainnet");

    renderHook(() => useOrdinals(utxos, { enabled: false }));

    expect(enabledFlag()).toBe(false);
  });
});
