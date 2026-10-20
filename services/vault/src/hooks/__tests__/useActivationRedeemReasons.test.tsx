/**
 * The Inactive Vaults row's redeem reason: the indexer names the activation
 * transaction, the chain gives its receipt, and the classifier reads it.
 */

import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAbiItem,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getReadersAtBlock } from "@/clients/eth-contract/sdk-readers";
import { POLLING_INTERVAL_MS } from "@/config/polling";
import {
  ACTIVATION_REDEEM_REASON_QUERY_KEY,
  useActivationRedeemReasons,
} from "@/hooks/useActivationRedeemReasons";
import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import {
  fetchActivationRows,
  type ActivationRow,
} from "@/services/activity/activationTxQuery";
import type { VaultActivity } from "@/types/activity";

const {
  REGISTRY,
  AAVE_ADAPTER,
  CHAIN_ID,
  getTransactionReceipt,
  getTransaction,
} = vi.hoisted(() => ({
  REGISTRY: "0xE976a4f2B90E64A9A9374453bC526e67625cC750",
  AAVE_ADAPTER: "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd",
  CHAIN_ID: 11155111,
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: { BTC_VAULT_REGISTRY: REGISTRY, AAVE_ADAPTER },
}));
vi.mock("@/config/network", () => ({
  getETHChain: () => ({ id: CHAIN_ID }),
}));
vi.mock("@/services/activity/activationTxQuery", () => ({
  fetchActivationRows: vi.fn(),
}));
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({ getTransactionReceipt, getTransaction }),
  },
}));
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getReadersAtBlock: vi.fn(),
}));

const VAULT_A = `0x${"aa".repeat(32)}` as Hex;
const ACTIVATION_TX = `0x${"1a".repeat(32)}` as Hex;
const RECEIPT_BLOCK = 100n;
const DEPOSITOR = "0x8c5283a3F2995ecF78319bb1ca3BD9a179b3E740" as Address;
const SECRET = `0x${"11".repeat(32)}` as Hex;
const PEGIN_TX_HASH = `0x${"22".repeat(32)}` as Hex;
const VP_KEY = `0x${"33".repeat(32)}` as Hex;
const DEPOSITOR_KEY = `0x${"44".repeat(32)}` as Hex;

function redeemed(applicationEntryPoint: string): VaultActivity {
  return {
    id: VAULT_A,
    collateral: { amount: "0.1", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    contractStatus: ContractStatus.REDEEMED,
    displayLabel: PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS,
    depositorWotsPkHash: "0xwotshash",
    unsignedPrePeginTx: "0xdeadbeef",
    applicationEntryPoint,
  };
}

function registryLog(
  logIndex: number,
  topics: readonly unknown[],
  data: Hex,
): Log {
  return {
    address: REGISTRY,
    logIndex,
    topics,
    data,
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: null,
    removed: false,
  } as unknown as Log;
}

function claimableByLog(claimerPK: Hex, logIndex: number): Log {
  const event = getAbiItem({
    abi: BTCVaultRegistryABI,
    name: "VaultClaimableBy",
  });
  const dataInputs = event.inputs.filter((input) => !input.indexed);
  return registryLog(
    logIndex,
    encodeEventTopics({
      abi: BTCVaultRegistryABI,
      eventName: "VaultClaimableBy",
      args: { vaultId: VAULT_A, peginTxHash: PEGIN_TX_HASH, claimerPK },
    }),
    encodeAbiParameters(
      dataInputs,
      dataInputs.map(() => 1),
    ),
  );
}

/** An activation the registry redeemed with no ActivationFailed after the redeem pair. */
const REDEEMED_ACTIVATION_RECEIPT = {
  blockNumber: RECEIPT_BLOCK,
  logs: [
    registryLog(
      0,
      encodeEventTopics({
        abi: BTCVaultRegistryABI,
        eventName: "PeginActivated",
        args: { vaultId: VAULT_A, depositor: DEPOSITOR },
      }),
      encodeAbiParameters([{ type: "bytes32" }], [SECRET]),
    ),
    claimableByLog(VP_KEY, 1),
    claimableByLog(DEPOSITOR_KEY, 2),
  ],
};

const ACTIVATE_TX = {
  to: REGISTRY,
  input: encodeFunctionData({
    abi: BTCVaultRegistryABI,
    functionName: "activateVaultWithSecret",
    args: [VAULT_A, SECRET, "0x"],
  }),
};

const rowsFetch = vi.mocked(fetchActivationRows);
const getTBVProtocolParams = vi.fn();

function gateAtEveryBlock() {
  getTBVProtocolParams.mockResolvedValue({ minActivationGas: 5_000_000n });
}

function activationRow(): ReadonlyMap<string, ActivationRow> {
  return new Map([[VAULT_A, { kind: "activation", txHash: ACTIVATION_TX }]]);
}

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderReasons(activities: VaultActivity[]) {
  return renderHook(() => useActivationRedeemReasons(activities), {
    wrapper,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.mocked(getReadersAtBlock).mockResolvedValue({
    protocolParamsReader: { getTBVProtocolParams },
  } as unknown as Awaited<ReturnType<typeof getReadersAtBlock>>);
  getTransactionReceipt.mockResolvedValue(REDEEMED_ACTIVATION_RECEIPT);
  getTransaction.mockResolvedValue(ACTIVATE_TX);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("useActivationRedeemReasons", () => {
  it("resolves cap_exceeded for a redeemed vault whose activation receipt has no ActivationFailed and whose block had the gate", async () => {
    rowsFetch.mockResolvedValue(activationRow());
    gateAtEveryBlock();

    const { result } = renderReasons([redeemed(AAVE_ADAPTER)]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A)).toEqual({ kind: "cap_exceeded" }),
    );
    expect(getTransactionReceipt).toHaveBeenCalledWith({
      hash: ACTIVATION_TX,
    });
    expect(getReadersAtBlock).toHaveBeenCalledWith(RECEIPT_BLOCK);
    expect(getTBVProtocolParams).toHaveBeenCalledWith(RECEIPT_BLOCK);
  });

  it("resolves unknown for a receipt mined before the gate existed, even though the gate exists now", async () => {
    rowsFetch.mockResolvedValue(activationRow());
    getTBVProtocolParams.mockImplementation(async (blockNumber?: bigint) => ({
      minActivationGas:
        blockNumber !== undefined && blockNumber <= RECEIPT_BLOCK
          ? null
          : 5_000_000n,
    }));

    const { result } = renderReasons([redeemed(AAVE_ADAPTER)]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A)).toEqual({ kind: "unknown" }),
    );
  });

  it("resolves unknown when the RPC cannot serve the receipt block's state", async () => {
    rowsFetch.mockResolvedValue(activationRow());
    getTBVProtocolParams.mockImplementation(async (blockNumber?: bigint) => {
      if (blockNumber === RECEIPT_BLOCK) throw new Error("missing trie node");
      return { minActivationGas: 5_000_000n };
    });

    const { result } = renderReasons([redeemed(AAVE_ADAPTER)]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A)).toEqual({ kind: "unknown" }),
    );
  });

  it("resolves unknown for a vault whose application is not the Aave adapter", async () => {
    rowsFetch.mockResolvedValue(activationRow());
    gateAtEveryBlock();

    const { result } = renderReasons([
      redeemed("0x1111111111111111111111111111111111111111"),
    ]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A)).toEqual({ kind: "unknown" }),
    );
  });

  it("keeps polling while the indexer has no row, then shows the reason once the deposit row arrives", async () => {
    rowsFetch
      .mockResolvedValueOnce(new Map())
      .mockResolvedValue(activationRow());
    gateAtEveryBlock();

    const { result } = renderReasons([redeemed(AAVE_ADAPTER)]);

    await waitFor(() => expect(rowsFetch).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);
    expect(getTransactionReceipt).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    await waitFor(() =>
      expect(result.current.get(VAULT_A)).toEqual({ kind: "cap_exceeded" }),
    );

    // Every listed vault has a row: no further request.
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2));
    expect(rowsFetch).toHaveBeenCalledTimes(2);
  });

  it("stops polling and shows no reason for a vault whose row is claim_expired", async () => {
    rowsFetch.mockResolvedValue(
      new Map<string, ActivationRow>([[VAULT_A, { kind: "claimed_expired" }]]),
    );

    const { result } = renderReasons([redeemed(AAVE_ADAPTER)]);

    await waitFor(() => expect(rowsFetch).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2));

    expect(rowsFetch).toHaveBeenCalledTimes(1);
    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("keys every query on the chain id and registry address", async () => {
    rowsFetch.mockResolvedValue(activationRow());
    gateAtEveryBlock();

    const { result } = renderReasons([redeemed(AAVE_ADAPTER)]);
    await waitFor(() => expect(result.current.size).toBe(1));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key.slice(0, 3)).toEqual([
        ACTIVATION_REDEEM_REASON_QUERY_KEY,
        CHAIN_ID,
        REGISTRY,
      ]);
    }
  });
});
