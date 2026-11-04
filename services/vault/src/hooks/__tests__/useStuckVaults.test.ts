/**
 * useStuckVaults — a depositor's stuck vaults are found from the registry and
 * Bitcoin alone, with no indexer in the picture: the chain must still report the
 * vault Verified, inside its activation window, and Bitcoin data must prove its
 * PegIn a valid spend of the HTLC. A mempool API that merely names the public
 * PegIn txid as the HTLC's spender must not turn a healthy vault stuck. The proof
 * itself (`provePeginSpendsHtlc`) is a seam here; it is tested in clients/btc and
 * its verifier on real transactions in the SDK.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { type Address, type Hex, zeroAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PeginSpendProof } from "@/clients/btc/outspend";

import {
  STUCK_VAULTS_QUERY_KEY,
  useStuckVaults,
  useStuckVaultsPoll,
} from "../useStuckVaults";

const mockGetVaultBasicInfo = vi.hoisted(() => vi.fn());
const mockGetProtocolInfoBatch = vi.hoisted(() => vi.fn());
const mockGetPegInConfiguration = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultBasicInfo: mockGetVaultBasicInfo,
    getProtocolInfoBatch: mockGetProtocolInfoBatch,
  }),
  getProtocolParamsReader: async () => ({
    getPegInConfiguration: mockGetPegInConfiguration,
  }),
}));

const mockGetDepositorVaultIds = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/btc-vault-registry/depositorVaultIds", () => ({
  getDepositorVaultIdsFromChain: mockGetDepositorVaultIds,
}));

const PINNED_BLOCK = 1_000n;
const mockResolvePinnedReadBlock = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/pinnedReadBlock", () => ({
  resolvePinnedReadBlock: mockResolvePinnedReadBlock,
}));

const mockFetchHtlcSpend = vi.hoisted(() => vi.fn());
const mockProvePeginSpendsHtlc = vi.hoisted(() => vi.fn());
vi.mock("@/clients/btc/outspend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/clients/btc/outspend")>()),
  fetchHtlcSpend: mockFetchHtlcSpend,
  provePeginSpendsHtlc: mockProvePeginSpendsHtlc,
}));

vi.mock("@/clients/btc/config", () => ({
  getMempoolApiUrl: () => "https://mempool.test/api",
}));

// The signed PegIn's txid is what the spender is matched against. It is read
// from the record's bytes, so a stubbed hash names which vault it belongs to.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/utils")
  >()),
  calculateBtcTxHash: (txHex: string) => {
    if (txHex === "0xmalformed") throw new Error("not a transaction");
    return `0x${txHex.slice(2).padStart(64, "0")}`;
  },
}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerEvent = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { warn: mockLoggerWarn, event: mockLoggerEvent },
}));

const DEPOSITOR: Address = "0x000000000000000000000000000000000000dEaD";
const OTHER_DEPOSITOR: Address = "0x000000000000000000000000000000000000bEEF";
const ACTIVATION_TIMEOUT = 100n;
const IN_WINDOW = 950n;
const PAST_DEADLINE = 800n;

const VAULT_A = `0x${"aa".repeat(32)}` as Hex;
const VAULT_B = `0x${"bb".repeat(32)}` as Hex;
const PRE_PEGIN_TX_HEX = "0x0200" as Hex;

interface ChainVault {
  /** Status at the pinned block. */
  status: number;
  /** Status at `latest`, if it differs from the pinned block's. */
  latestStatus?: number;
  createdAt?: bigint;
  depositor?: Address;
}

/** A vault's registry record. Its Pre-PegIn hash names the vault in spend reads. */
function protocolInfoOf(id: Hex) {
  return {
    depositorSignedPeginTx: `0x${id.slice(2, 6)}` as Hex,
    prePeginTxHash: id,
    htlcVout: 0,
    hashlock: `0x${"dd".repeat(32)}` as Hex,
  };
}

/** The txid `calculateBtcTxHash` gives a vault's signed PegIn, bare hex. */
function peginTxidOf(id: Hex): string {
  return protocolInfoOf(id).depositorSignedPeginTx.slice(2).padStart(64, "0");
}

function chainHolds(vaults: ReadonlyMap<Hex, ChainVault>) {
  mockGetDepositorVaultIds.mockResolvedValue([...vaults.keys()]);
  mockGetVaultBasicInfo.mockImplementation(async (id: Hex, block?: bigint) => {
    const vault = vaults.get(id);
    if (!vault) throw new Error("rpc down");
    const status =
      block === undefined ? (vault.latestStatus ?? vault.status) : vault.status;
    return {
      depositor: vault.depositor ?? DEPOSITOR,
      status,
      createdAt: vault.createdAt ?? IN_WINDOW,
      depositorBtcPubKey: `0x${"ab".repeat(32)}`,
      amount: 1_000n,
      vaultProvider: "0x0000000000000000000000000000000000000001",
      applicationEntryPoint: "0x0000000000000000000000000000000000000002",
    };
  });
  mockGetProtocolInfoBatch.mockImplementation(async (ids: Hex[]) =>
    ids.map(protocolInfoOf),
  );
}

/** What the spend read answers per vault; by default its PegIn spent its HTLC. */
function bitcoinReportsSpends(
  overrides: ReadonlyMap<Hex, unknown> = new Map(),
) {
  mockFetchHtlcSpend.mockImplementation(async (prePeginTxHash: Hex) => {
    const override = overrides.get(prePeginTxHash);
    if (override instanceof Error) throw override;
    return (
      override ?? {
        spent: true,
        confirmed: true,
        spendingTxid: peginTxidOf(prePeginTxHash),
      }
    );
  });
}

function bitcoinProves(proofs: ReadonlyMap<Hex, PeginSpendProof>) {
  mockProvePeginSpendsHtlc.mockImplementation(
    async (record: { depositorSignedPeginTx: Hex }) => {
      const id = [...proofs.keys()].find(
        (candidate) =>
          protocolInfoOf(candidate).depositorSignedPeginTx ===
          record.depositorSignedPeginTx,
      );
      const proof = id && proofs.get(id);
      if (!proof) throw new Error("no proof stubbed for this vault");
      return proof;
    },
  );
}

const PROVEN: PeginSpendProof = {
  status: "proven",
  prePeginTxHex: PRE_PEGIN_TX_HEX,
};
const UNPROVEN: PeginSpendProof = {
  status: "unproven",
  reason: "the depositor's signature does not verify",
};
const UNAVAILABLE: PeginSpendProof = {
  status: "unavailable",
  cause: new Error("Mempool API error (429)"),
};

function renderStuckVaults(
  initialProps: { address: Address | undefined } = { address: DEPOSITOR },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const view = renderHook(
    ({ address }: { address: Address | undefined }) => {
      useStuckVaultsPoll(address);
      return useStuckVaults(address);
    },
    { wrapper, initialProps },
  );
  return { ...view, queryClient };
}

/** Flushes React Query's scheduled notifications into the rendered hook. */
async function flushNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Waits out the first read, so a result asserted empty is a real answer. */
async function settled(queryClient: QueryClient) {
  await waitFor(() => {
    const [query] = queryClient.getQueryCache().getAll();
    expect(query.state.dataUpdateCount).toBeGreaterThan(0);
    expect(query.state.fetchStatus).toBe("idle");
  });
  await flushNotifications();
}

/** One more poll, rendered. */
async function polled(queryClient: QueryClient) {
  await act(() => queryClient.refetchQueries());
  await flushNotifications();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolvePinnedReadBlock.mockResolvedValue(PINNED_BLOCK);
  mockGetPegInConfiguration.mockResolvedValue({
    pegInActivationTimeout: ACTIVATION_TIMEOUT,
  });
  bitcoinReportsSpends();
  bitcoinProves(
    new Map([
      [VAULT_A, PROVEN],
      [VAULT_B, PROVEN],
    ]),
  );
});

describe("useStuckVaults", () => {
  it("finds a stuck vault from the depositor's on-chain list and the chain's own Bitcoin identifiers", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );

    const { result } = renderStuckVaults();

    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));
    expect(mockGetDepositorVaultIds).toHaveBeenCalledWith(DEPOSITOR);
    expect(mockFetchHtlcSpend).toHaveBeenCalledWith(
      protocolInfoOf(VAULT_A).prePeginTxHash,
      protocolInfoOf(VAULT_A).htlcVout,
      "https://mempool.test/api",
    );
    expect(result.current.get(VAULT_A)).toMatchObject({
      id: VAULT_A,
      peginTxHash: `0x${peginTxidOf(VAULT_A)}`,
      prePeginTxHex: PRE_PEGIN_TX_HEX,
    });
  });

  it("keys and ids a vault lowercased whatever casing the list holds", async () => {
    const mixedCase = `0x${"Aa".repeat(32)}` as Hex;
    chainHolds(
      new Map([[mixedCase, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    mockProvePeginSpendsHtlc.mockResolvedValue(PROVEN);

    const { result } = renderStuckVaults();

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(mixedCase.toLowerCase())?.id).toBe(
      mixedCase.toLowerCase(),
    );
  });

  it("makes no further read for a depositor with no vaults", async () => {
    chainHolds(new Map());

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(result.current.size).toBe(0);
    expect(mockGetDepositorVaultIds).toHaveBeenCalledTimes(1);
    expect(mockResolvePinnedReadBlock).not.toHaveBeenCalled();
    expect(mockGetVaultBasicInfo).not.toHaveBeenCalled();
  });

  it("reads nothing with no wallet connected", async () => {
    const { result } = renderStuckVaults({ address: undefined });
    await flushNotifications();

    expect(result.current.size).toBe(0);
    expect(mockGetDepositorVaultIds).not.toHaveBeenCalled();
  });

  it("does not report a vault whose HTLC another transaction spent", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    bitcoinReportsSpends(
      new Map([
        [
          VAULT_A,
          { spent: true, confirmed: true, spendingTxid: "ee".repeat(32) },
        ],
      ]),
    );

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(result.current.size).toBe(0);
    expect(mockProvePeginSpendsHtlc).not.toHaveBeenCalled();
  });

  it("does not report a vault whose PegIn the mempool API serves without a valid witness, and sends one event across polls", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    bitcoinProves(new Map([[VAULT_A, UNPROVEN]]));

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);
    await polled(queryClient);

    expect(result.current.size).toBe(0);
    expect(mockProvePeginSpendsHtlc).toHaveBeenCalledTimes(2);
    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    expect(mockLoggerEvent).toHaveBeenCalledWith(
      "activation.stuck_proof.refused",
      expect.objectContaining({
        reason: "the depositor's signature does not verify",
      }),
    );
  });

  it("does not report a vault the chain reports Active, and never proves its PegIn", async () => {
    chainHolds(new Map([[VAULT_A, { status: OnChainBtcVaultStatus.ACTIVE }]]));

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(result.current.size).toBe(0);
    expect(mockFetchHtlcSpend).not.toHaveBeenCalled();
    expect(mockProvePeginSpendsHtlc).not.toHaveBeenCalled();
  });

  it("does not report a vault that activated after the pinned block, reading the latest status after the proof", async () => {
    chainHolds(
      new Map([
        [
          VAULT_A,
          {
            status: OnChainBtcVaultStatus.VERIFIED,
            latestStatus: OnChainBtcVaultStatus.ACTIVE,
          },
        ],
      ]),
    );

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(result.current.size).toBe(0);
    expect(mockProvePeginSpendsHtlc).toHaveBeenCalledTimes(1);
    const latestRead = mockGetVaultBasicInfo.mock.calls.findIndex(
      ([, block]) => block === undefined,
    );
    expect(
      mockGetVaultBasicInfo.mock.invocationCallOrder[latestRead],
    ).toBeGreaterThan(mockProvePeginSpendsHtlc.mock.invocationCallOrder[0]);
  });

  it("does not report a vault past its activation deadline, whose exit the contract would reject", async () => {
    chainHolds(
      new Map([
        [
          VAULT_A,
          {
            status: OnChainBtcVaultStatus.VERIFIED,
            createdAt: PAST_DEADLINE,
          },
        ],
      ]),
    );

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(result.current.size).toBe(0);
    expect(mockFetchHtlcSpend).not.toHaveBeenCalled();
  });

  it("stops walking the list at the first vault past its deadline, since every older one is too", async () => {
    const ids = Array.from(
      { length: 60 },
      (_, index) => `0x${index.toString(16).padStart(64, "0")}` as Hex,
    );
    // Oldest first, as the registry appends. The newest 30 are in their window.
    chainHolds(
      new Map(
        ids.map((id, index) => [
          id,
          {
            status: OnChainBtcVaultStatus.ACTIVE,
            createdAt: index < 30 ? PAST_DEADLINE : IN_WINDOW,
          },
        ]),
      ),
    );

    const { queryClient } = renderStuckVaults();
    await settled(queryClient);

    // Two chunks of 25 reach the first past-deadline vault; the third is unread.
    expect(mockGetVaultBasicInfo).toHaveBeenCalledTimes(50);
    expect(mockGetVaultBasicInfo).not.toHaveBeenCalledWith(
      ids[0],
      PINNED_BLOCK,
    );
  });

  it("keeps walking past empty records, which say nothing about older vaults", async () => {
    const newestEmpty = Array.from(
      { length: 25 },
      (_, index) => `0x${(index + 1).toString(16).padStart(64, "0")}` as Hex,
    );
    chainHolds(
      new Map<Hex, ChainVault>([
        [VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }],
        ...newestEmpty.map((id): [Hex, ChainVault] => [
          id,
          {
            status: OnChainBtcVaultStatus.PENDING,
            createdAt: 0n,
            depositor: zeroAddress,
          },
        ]),
      ]),
    );

    const { result } = renderStuckVaults();

    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));
  });

  it("walks further when governance raises the activation timeout", async () => {
    chainHolds(
      new Map([
        [
          VAULT_A,
          {
            status: OnChainBtcVaultStatus.VERIFIED,
            createdAt: PAST_DEADLINE,
          },
        ],
      ]),
    );
    mockGetPegInConfiguration.mockResolvedValue({
      pegInActivationTimeout: 500n,
    });

    const { result } = renderStuckVaults();

    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));
  });

  it("gives a malformed record its own refusal without costing the other vault", async () => {
    chainHolds(
      new Map([
        [VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }],
        [VAULT_B, { status: OnChainBtcVaultStatus.VERIFIED }],
      ]),
    );
    mockGetProtocolInfoBatch.mockImplementation(async (ids: Hex[]) =>
      ids.map((id) =>
        id === VAULT_B
          ? { ...protocolInfoOf(id), depositorSignedPeginTx: "0xmalformed" }
          : protocolInfoOf(id),
      ),
    );

    const { result } = renderStuckVaults();

    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));
    expect(result.current.has(VAULT_B)).toBe(false);
    expect(mockLoggerEvent).toHaveBeenCalledWith(
      "activation.stuck_proof.refused",
      expect.objectContaining({ error: "Error: not a transaction" }),
    );
  });

  it("warns about a failed record read and still reports the vaults it could read", async () => {
    chainHolds(
      new Map([
        [VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }],
        [VAULT_B, { status: OnChainBtcVaultStatus.VERIFIED }],
      ]),
    );
    const readRecord = mockGetVaultBasicInfo.getMockImplementation();
    mockGetVaultBasicInfo.mockImplementation(
      async (id: Hex, block?: bigint) => {
        if (id === VAULT_B) throw new Error("node hiccup");
        return readRecord?.(id, block);
      },
    );

    const { result } = renderStuckVaults();

    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));
    expect(result.current.has(VAULT_B)).toBe(false);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Stuck-state registry read failed",
      expect.objectContaining({ cause: "Error: node hiccup" }),
    );
  });

  it("warns about a failed protocol record read and still reports the vault it could read, at the walk's block", async () => {
    chainHolds(
      new Map([
        [VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }],
        [VAULT_B, { status: OnChainBtcVaultStatus.VERIFIED }],
      ]),
    );
    mockGetProtocolInfoBatch.mockImplementation(async (ids: Hex[]) => {
      if (ids.includes(VAULT_B)) throw new Error("record empty");
      return ids.map(protocolInfoOf);
    });

    const { result } = renderStuckVaults();

    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));
    expect(result.current.has(VAULT_B)).toBe(false);
    expect(mockGetProtocolInfoBatch).toHaveBeenCalledWith(
      [VAULT_A],
      PINNED_BLOCK,
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Stuck-state protocol record read failed",
      expect.objectContaining({ cause: "Error: record empty" }),
    );
  });

  it("does not report a proven vault whose latest status read fails, and warns about it", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const readRecord = mockGetVaultBasicInfo.getMockImplementation();
    mockGetVaultBasicInfo.mockImplementation(
      async (id: Hex, block?: bigint) => {
        if (block === undefined) throw new Error("node hiccup");
        return readRecord?.(id, block);
      },
    );

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(mockProvePeginSpendsHtlc).toHaveBeenCalledTimes(1);
    expect(result.current.size).toBe(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Stuck-state latest status read failed",
      expect.objectContaining({ cause: "Error: node hiccup" }),
    );
  });

  it("resolves empty when the list read fails, rather than rejecting on every poll of an outage", async () => {
    chainHolds(new Map());
    mockGetDepositorVaultIds.mockRejectedValue(new Error("rpc down"));

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(result.current.size).toBe(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Stuck-vault chain read failed",
      expect.objectContaining({ cause: "Error: rpc down" }),
    );
    expect(queryClient.getQueryCache().getAll()[0].state.status).toBe(
      "success",
    );
  });

  it("keeps a proven vault through a failed PegIn fetch, with its earlier bytes, while the chain still reports it Verified", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const { result, queryClient } = renderStuckVaults();
    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));

    bitcoinProves(new Map([[VAULT_A, UNAVAILABLE]]));
    await polled(queryClient);

    expect(result.current.get(VAULT_A)?.prePeginTxHex).toBe(PRE_PEGIN_TX_HEX);
  });

  it("keeps a proven vault through a failed spend read", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const { result, queryClient } = renderStuckVaults();
    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));

    bitcoinReportsSpends(
      new Map([[VAULT_A, new Error("Mempool API error (429)")]]),
    );
    await polled(queryClient);

    expect(result.current.has(VAULT_A)).toBe(true);
  });

  it("does not carry a vault no earlier poll proved", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    bitcoinProves(new Map([[VAULT_A, UNAVAILABLE]]));

    const { result, queryClient } = renderStuckVaults();
    await settled(queryClient);

    expect(result.current.size).toBe(0);
  });

  it("drops a carried vault when the chain says it activated", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const { result, queryClient } = renderStuckVaults();
    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));

    bitcoinProves(new Map([[VAULT_A, UNAVAILABLE]]));
    chainHolds(
      new Map([
        [
          VAULT_A,
          {
            status: OnChainBtcVaultStatus.VERIFIED,
            latestStatus: OnChainBtcVaultStatus.ACTIVE,
          },
        ],
      ]),
    );
    await polled(queryClient);

    expect(result.current.size).toBe(0);
  });

  it("drops a proven vault when a chain read fails, since nothing then says it is unactivated", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const { result, queryClient } = renderStuckVaults();
    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));

    mockGetDepositorVaultIds.mockRejectedValue(new Error("rpc down"));
    await polled(queryClient);

    expect(result.current.size).toBe(0);
  });

  it("drops a proven vault once the mempool API serves its PegIn without a valid witness", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const { result, queryClient } = renderStuckVaults();
    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));

    bitcoinProves(new Map([[VAULT_A, UNPROVEN]]));
    await polled(queryClient);

    expect(result.current.size).toBe(0);
  });

  it("shows nothing from one wallet's read under another wallet", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const { result, rerender } = renderStuckVaults();
    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));

    chainHolds(new Map());
    rerender({ address: OTHER_DEPOSITOR });

    expect(result.current.size).toBe(0);
    await flushNotifications();
    expect(mockGetDepositorVaultIds).toHaveBeenLastCalledWith(OTHER_DEPOSITOR);
    expect(result.current.size).toBe(0);
  });

  it("starts no read of its own from the passive hook", async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useStuckVaults(DEPOSITOR), { wrapper });
    await flushNotifications();

    expect(result.current.size).toBe(0);
    expect(mockGetDepositorVaultIds).not.toHaveBeenCalled();
  });

  it("re-reads on an invalidation although a passive reader rendered last", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const { result, queryClient } = renderStuckVaults();
    await waitFor(() => expect(result.current.has(VAULT_A)).toBe(true));

    chainHolds(new Map());
    await act(() =>
      queryClient.invalidateQueries({ queryKey: [STUCK_VAULTS_QUERY_KEY] }),
    );
    await flushNotifications();

    expect(result.current.size).toBe(0);
  });

  it("makes one read for a poller and several passive readers", async () => {
    chainHolds(
      new Map([[VAULT_A, { status: OnChainBtcVaultStatus.VERIFIED }]]),
    );
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(
      () => {
        useStuckVaultsPoll(DEPOSITOR);
        return [
          useStuckVaults(DEPOSITOR),
          useStuckVaults(DEPOSITOR),
          useStuckVaults(DEPOSITOR),
        ];
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current[2].has(VAULT_A)).toBe(true));
    expect(result.current[0].has(VAULT_A)).toBe(true);
    expect(mockGetDepositorVaultIds).toHaveBeenCalledTimes(1);
  });
});
