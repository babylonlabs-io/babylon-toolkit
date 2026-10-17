/**
 * useStuckVaultChainConfirm — a suspected-stuck vault is confirmed only when
 * the chain still reports it Verified AND Bitcoin data proves its PegIn is a
 * valid spend of the HTLC. A mempool API that merely names the public PegIn txid as the HTLC's
 * spender must not turn a healthy vault stuck. The proof itself
 * (`provePeginSpendsHtlc`) is a seam here; it is tested in clients/btc and its
 * verifier on real transactions in the SDK.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PeginSpendProof } from "@/clients/btc/outspend";

import { useStuckVaultChainConfirm } from "../useStuckVaultChainConfirm";

const mockGetVaultBasicInfo = vi.hoisted(() => vi.fn());
const mockGetVaultProtocolInfo = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultBasicInfo: mockGetVaultBasicInfo,
    getVaultProtocolInfo: mockGetVaultProtocolInfo,
  }),
}));

const mockProvePeginSpendsHtlc = vi.hoisted(() => vi.fn());
vi.mock("@/clients/btc/outspend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/clients/btc/outspend")>()),
  provePeginSpendsHtlc: mockProvePeginSpendsHtlc,
}));

const API_URL = "https://mempool.test/api";
vi.mock("@/clients/btc/config", () => ({
  getMempoolApiUrl: () => "https://mempool.test/api",
}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerEvent = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { warn: mockLoggerWarn, event: mockLoggerEvent },
}));

const DEPOSITOR = "0x000000000000000000000000000000000000dEaD";

// Mixed-case ids, as the indexer returns them; the result is keyed lowercase.
const VAULT_A = `0x${"Aa".repeat(32)}` as Hex;
const VAULT_B = `0x${"Bb".repeat(32)}` as Hex;

/** Each vault's registry record; the proof is keyed on its signed PegIn. */
const PROTOCOL_INFO = new Map<Hex, Record<string, unknown>>([
  [VAULT_A, { depositorSignedPeginTx: "0xsigned-a", htlcVout: 0 }],
  [VAULT_B, { depositorSignedPeginTx: "0xsigned-b", htlcVout: 0 }],
]);

const PROVEN: PeginSpendProof = { status: "proven" };
const UNPROVEN: PeginSpendProof = {
  status: "unproven",
  reason: "the depositor's signature does not verify",
};
const UNAVAILABLE: PeginSpendProof = {
  status: "unavailable",
  cause: new Error("Mempool API error (429)"),
};

/** What the chain reports per vault; a missing entry is an unreadable record. */
function chainReports(statuses: Map<Hex, number>) {
  mockGetVaultBasicInfo.mockImplementation(async (id: Hex) => {
    const status = statuses.get(id);
    if (status === undefined) throw new Error("rpc down");
    return { depositor: DEPOSITOR, status };
  });
  mockGetVaultProtocolInfo.mockImplementation(async (id: Hex) =>
    PROTOCOL_INFO.get(id),
  );
}

/** What the Bitcoin proof gives for each vault's PegIn. */
function bitcoinProves(proofs: Map<Hex, PeginSpendProof>) {
  mockProvePeginSpendsHtlc.mockImplementation(
    async (record: { depositorSignedPeginTx: string }) => {
      const vault = [...PROTOCOL_INFO].find(
        ([, info]) =>
          info.depositorSignedPeginTx === record.depositorSignedPeginTx,
      )?.[0];
      const proof = vault && proofs.get(vault);
      if (!proof) throw new Error("no proof stubbed for this vault");
      return proof;
    },
  );
}

function renderConfirm(suspects: readonly Hex[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const view = renderHook(() => useStuckVaultChainConfirm(suspects), {
    wrapper,
  });
  return { ...view, queryClient };
}

const BOTH_VERIFIED = new Map([
  [VAULT_A, OnChainBtcVaultStatus.VERIFIED],
  [VAULT_B, OnChainBtcVaultStatus.VERIFIED],
]);

beforeEach(() => {
  mockLoggerWarn.mockReset();
  mockLoggerEvent.mockReset();
  mockGetVaultBasicInfo.mockReset();
  mockGetVaultProtocolInfo.mockReset();
  mockProvePeginSpendsHtlc.mockReset();
});

describe("useStuckVaultChainConfirm", () => {
  it("confirms a vault the chain still reports Verified whose PegIn is proven a valid spend of the HTLC", async () => {
    chainReports(new Map([[VAULT_A, OnChainBtcVaultStatus.VERIFIED]]));
    bitcoinProves(new Map<Hex, PeginSpendProof>([[VAULT_A, PROVEN]]));

    const { result } = renderConfirm([VAULT_A]);

    await waitFor(() =>
      expect(result.current.has(VAULT_A.toLowerCase())).toBe(true),
    );
    // The proof reads the vault's on-chain registry record, never the indexer's.
    expect(mockProvePeginSpendsHtlc).toHaveBeenCalledWith(
      PROTOCOL_INFO.get(VAULT_A),
      API_URL,
    );
  });

  it("does not confirm a vault whose PegIn the mempool API serves without a valid witness", async () => {
    chainReports(BOTH_VERIFIED);
    bitcoinProves(
      new Map<Hex, PeginSpendProof>([
        [VAULT_A, UNPROVEN],
        [VAULT_B, PROVEN],
      ]),
    );

    const { result } = renderConfirm([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(true),
    );
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(false);
  });

  it("reports a refused PegIn proof as an event with its reason, once per vault rather than every poll", async () => {
    chainReports(BOTH_VERIFIED);
    bitcoinProves(
      new Map<Hex, PeginSpendProof>([
        [VAULT_A, UNPROVEN],
        [VAULT_B, PROVEN],
      ]),
    );
    const { result, queryClient } = renderConfirm([VAULT_A, VAULT_B]);
    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(true),
    );

    await act(() => queryClient.refetchQueries());

    expect(mockProvePeginSpendsHtlc).toHaveBeenCalledTimes(4);
    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    expect(mockLoggerEvent).toHaveBeenCalledWith(
      "activation.stuck_proof.refused",
      expect.objectContaining({
        reason: "the depositor's signature does not verify",
      }),
    );
  });

  it("reports a proof that throws on a malformed registry record as an event", async () => {
    chainReports(BOTH_VERIFIED);
    bitcoinProves(new Map<Hex, PeginSpendProof>([[VAULT_B, PROVEN]]));

    const { result } = renderConfirm([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(true),
    );
    expect(mockLoggerEvent).toHaveBeenCalledWith(
      "activation.stuck_proof.refused",
      expect.objectContaining({
        error: "Error: no proof stubbed for this vault",
      }),
    );
  });

  it("does not confirm a vault whose PegIn cannot be fetched from Bitcoin", async () => {
    chainReports(BOTH_VERIFIED);
    bitcoinProves(
      new Map<Hex, PeginSpendProof>([
        [VAULT_A, UNAVAILABLE],
        [VAULT_B, PROVEN],
      ]),
    );

    const { result } = renderConfirm([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(true),
    );
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(false);
  });

  it("does not confirm a vault whose proof throws on a malformed registry record", async () => {
    chainReports(BOTH_VERIFIED);
    bitcoinProves(new Map<Hex, PeginSpendProof>([[VAULT_B, PROVEN]]));

    const { result } = renderConfirm([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(true),
    );
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(false);
  });

  it("does not confirm a vault the chain reports Active, and never proves its PegIn", async () => {
    chainReports(
      new Map([
        [VAULT_A, OnChainBtcVaultStatus.ACTIVE],
        [VAULT_B, OnChainBtcVaultStatus.VERIFIED],
      ]),
    );
    bitcoinProves(
      new Map<Hex, PeginSpendProof>([
        [VAULT_A, PROVEN],
        [VAULT_B, PROVEN],
      ]),
    );

    const { result } = renderConfirm([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(true),
    );
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(false);
    expect(mockProvePeginSpendsHtlc).not.toHaveBeenCalledWith(
      PROTOCOL_INFO.get(VAULT_A),
      API_URL,
    );
  });

  it("does not confirm a vault whose status cannot be read", async () => {
    chainReports(new Map([[VAULT_B, OnChainBtcVaultStatus.VERIFIED]]));
    bitcoinProves(
      new Map<Hex, PeginSpendProof>([
        [VAULT_A, PROVEN],
        [VAULT_B, PROVEN],
      ]),
    );

    const { result } = renderConfirm([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(true),
    );
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(false);
  });

  it("keeps a proven vault confirmed through a failed PegIn fetch while the chain still reports it Verified", async () => {
    chainReports(BOTH_VERIFIED);
    bitcoinProves(
      new Map<Hex, PeginSpendProof>([
        [VAULT_A, PROVEN],
        [VAULT_B, PROVEN],
      ]),
    );
    const { result, queryClient } = renderConfirm([VAULT_A, VAULT_B]);
    await waitFor(() => expect(result.current.size).toBe(2));

    // The next poll: vault A's fetch hits a rate limit, while vault B's PegIn
    // is served without a valid witness — B dropping marks that poll rendered.
    bitcoinProves(
      new Map<Hex, PeginSpendProof>([
        [VAULT_A, UNAVAILABLE],
        [VAULT_B, UNPROVEN],
      ]),
    );
    await act(() => queryClient.refetchQueries());

    await waitFor(() =>
      expect(result.current.has(VAULT_B.toLowerCase())).toBe(false),
    );
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(true);
  });

  it("drops a proven vault once the mempool API serves its PegIn without a valid witness", async () => {
    chainReports(new Map([[VAULT_A, OnChainBtcVaultStatus.VERIFIED]]));
    bitcoinProves(new Map<Hex, PeginSpendProof>([[VAULT_A, PROVEN]]));
    const { result, queryClient } = renderConfirm([VAULT_A]);
    await waitFor(() =>
      expect(result.current.has(VAULT_A.toLowerCase())).toBe(true),
    );

    bitcoinProves(new Map<Hex, PeginSpendProof>([[VAULT_A, UNPROVEN]]));
    await act(() => queryClient.refetchQueries());

    await waitFor(() =>
      expect(result.current.has(VAULT_A.toLowerCase())).toBe(false),
    );
  });
});
