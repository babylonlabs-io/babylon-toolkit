/**
 * useChainExpiryCheck — a vault the chain can no longer advance is expired
 * whatever the indexer says. An unreported expiry is told apart from a reported
 * one, and a conclusion survives a failed read but not a good one that disagrees.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { type Hex, zeroAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyChainExpiry,
  useChainExpiryCheck,
} from "../useChainExpiryCheck";

const mockResolvePinnedReadBlock = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/pinnedReadBlock", () => ({
  resolvePinnedReadBlock: mockResolvePinnedReadBlock,
}));

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

const DEPOSITOR = "0x000000000000000000000000000000000000dEaD";

// Mixed-case ids, as the indexer returns them; the result is keyed lowercase.
const VAULT_A = `0x${"Aa".repeat(32)}` as Hex;
const VAULT_B = `0x${"Bb".repeat(32)}` as Hex;

const CREATED_AT = 1_000n;
const ACK_TIMEOUT = 100n;
const ACTIVATION_TIMEOUT = 500n;
// Inside the activation window of a Verified vault, which ends at 1_500.
const BLOCK_BEFORE_DEADLINES = 1_200n;
// Past both deadlines: 1_100 for an ACK, 1_500 for an activation.
const BLOCK_PAST_DEADLINES = 2_000n;

function verifiedRecord() {
  return {
    depositor: DEPOSITOR,
    createdAt: CREATED_AT,
    status: OnChainBtcVaultStatus.VERIFIED,
  };
}

function expiredRecord() {
  return { ...verifiedRecord(), status: OnChainBtcVaultStatus.EXPIRED };
}

function redeemedRecord() {
  return { ...verifiedRecord(), status: OnChainBtcVaultStatus.REDEEMED };
}

function renderCheck(candidateIds: readonly Hex[]) {
  const onQueryError = vi.fn();
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: onQueryError }),
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const view = renderHook(({ ids }) => useChainExpiryCheck(ids), {
    wrapper,
    initialProps: { ids: candidateIds },
  });
  return { ...view, client, onQueryError };
}

/** Waits out the fetch, then the macrotask React Query notifies observers on. */
async function settled(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** Runs one more poll to completion, with whatever the mocks now answer. */
async function pollAgain(client: QueryClient) {
  await act(() => client.invalidateQueries());
  await settled(client);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolvePinnedReadBlock.mockResolvedValue(BLOCK_PAST_DEADLINES);
  mockGetPegInConfiguration.mockResolvedValue({
    pegInAckTimeout: ACK_TIMEOUT,
    pegInActivationTimeout: ACTIVATION_TIMEOUT,
  });
  mockGetVaultBasicInfo.mockResolvedValue(verifiedRecord());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyChainExpiry", () => {
  function classify(status: OnChainBtcVaultStatus, block: bigint) {
    return classifyChainExpiry({
      status,
      createdAt: CREATED_AT,
      block,
      pegInAckTimeout: ACK_TIMEOUT,
      pegInActivationTimeout: ACTIVATION_TIMEOUT,
    });
  }

  it("reports a vault the registry records Expired, at any block", () => {
    expect(classify(OnChainBtcVaultStatus.EXPIRED, CREATED_AT)).toEqual({
      state: "reported",
    });
  });

  it("calls a Pending vault past its ack deadline unreported, with the ack reason", () => {
    expect(classify(OnChainBtcVaultStatus.PENDING, 1_101n)).toEqual({
      state: "unreported",
      reason: "ack_timeout",
    });
  });

  it("does not expire a Pending vault exactly at its ack deadline, which the contract still accepts", () => {
    expect(classify(OnChainBtcVaultStatus.PENDING, 1_100n)).toBeUndefined();
  });

  it("calls a Verified vault past its activation deadline unreported, with the activation reason", () => {
    expect(classify(OnChainBtcVaultStatus.VERIFIED, 1_501n)).toEqual({
      state: "unreported",
      reason: "activation_timeout",
    });
  });

  it("does not expire a Verified vault exactly at its activation deadline, which the contract still accepts", () => {
    expect(classify(OnChainBtcVaultStatus.VERIFIED, 1_500n)).toBeUndefined();
  });

  it("holds a Verified vault to the activation timeout, not the shorter ack timeout", () => {
    expect(classify(OnChainBtcVaultStatus.VERIFIED, 1_200n)).toBeUndefined();
  });

  it("does not expire an Active vault, however old", () => {
    expect(
      classify(OnChainBtcVaultStatus.ACTIVE, BLOCK_PAST_DEADLINES),
    ).toBeUndefined();
  });

  it("calls a vault the registry records Redeemed redeemed, at any block", () => {
    expect(classify(OnChainBtcVaultStatus.REDEEMED, CREATED_AT)).toEqual({
      state: "redeemed",
      reason: undefined,
    });
  });
});

describe("useChainExpiryCheck", () => {
  it("keys an expired vault by its lowercased id", async () => {
    const { result } = renderCheck([VAULT_A]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
        state: "unreported",
        reason: "activation_timeout",
      }),
    );
  });

  it("reads each vault at the block it is compared against", async () => {
    const { result } = renderCheck([VAULT_A]);

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(mockGetVaultBasicInfo).toHaveBeenCalledWith(
      VAULT_A,
      BLOCK_PAST_DEADLINES,
    );
  });

  it("reads the timeouts at the block it reads the vault, so a later timeout change cannot pair with an older status", async () => {
    const { result } = renderCheck([VAULT_A]);

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(mockGetPegInConfiguration).toHaveBeenCalledWith(
      BLOCK_PAST_DEADLINES,
    );
  });

  it("gives a reported vault that had been verified the activation timeout", async () => {
    mockGetVaultBasicInfo.mockResolvedValue(expiredRecord());
    mockGetProtocolInfoBatch.mockResolvedValue([{ verifiedAt: 1_050n }]);

    const { result } = renderCheck([VAULT_A]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
        state: "reported",
        reason: "activation_timeout",
      }),
    );
  });

  it("gives a reported vault that was never verified the ack timeout", async () => {
    mockGetVaultBasicInfo.mockResolvedValue(expiredRecord());
    mockGetProtocolInfoBatch.mockResolvedValue([{ verifiedAt: 0n }]);

    const { result } = renderCheck([VAULT_A]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
        state: "reported",
        reason: "ack_timeout",
      }),
    );
  });

  it("reads a reported vault's reason at the block it read the status", async () => {
    mockGetVaultBasicInfo.mockResolvedValue(expiredRecord());
    mockGetProtocolInfoBatch.mockResolvedValue([{ verifiedAt: 1_050n }]);

    const { result } = renderCheck([VAULT_A]);

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(mockGetProtocolInfoBatch).toHaveBeenCalledWith(
      [VAULT_A],
      BLOCK_PAST_DEADLINES,
    );
  });

  it("gives each reported vault its own reason, and reads none for an unreported one", async () => {
    mockGetVaultBasicInfo.mockImplementation(async (id: Hex) =>
      id === VAULT_A ? expiredRecord() : verifiedRecord(),
    );
    mockGetProtocolInfoBatch.mockResolvedValue([{ verifiedAt: 0n }]);

    const { result } = renderCheck([VAULT_A, VAULT_B]);

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(mockGetProtocolInfoBatch).toHaveBeenCalledWith(
      [VAULT_A],
      BLOCK_PAST_DEADLINES,
    );
    expect(result.current.get(VAULT_A.toLowerCase())?.reason).toBe(
      "ack_timeout",
    );
    expect(result.current.get(VAULT_B.toLowerCase())?.reason).toBe(
      "activation_timeout",
    );
  });

  it("reads no reason when no vault is reported", async () => {
    const { result } = renderCheck([VAULT_A]);

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(mockGetProtocolInfoBatch).not.toHaveBeenCalled();
  });

  it("still reads a reported vault as expired when its reason cannot be read", async () => {
    mockGetVaultBasicInfo.mockResolvedValue(expiredRecord());
    mockGetProtocolInfoBatch.mockRejectedValue(new Error("rpc down"));

    const { result, client, onQueryError } = renderCheck([VAULT_A]);

    await settled(client);
    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "reported",
      reason: undefined,
    });
    expect(onQueryError).not.toHaveBeenCalled();
  });

  it("keeps the reason it already had when a report lands and the reason read fails", async () => {
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetVaultBasicInfo.mockResolvedValue(expiredRecord());
    mockGetProtocolInfoBatch.mockRejectedValue(new Error("rpc down"));
    await pollAgain(client);

    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "reported",
      reason: "activation_timeout",
    });
  });

  it("gives a vault redeemed after an expiry report the activation timeout", async () => {
    mockGetVaultBasicInfo.mockResolvedValue(redeemedRecord());
    mockGetProtocolInfoBatch.mockResolvedValue([
      { verifiedAt: 1_050n, claimExpiredUntil: 3_000n },
    ]);

    const { result } = renderCheck([VAULT_A]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
        state: "redeemed",
        reason: "activation_timeout",
      }),
    );
  });

  it("gives a vault redeemed without expiring no reason", async () => {
    mockGetVaultBasicInfo.mockResolvedValue(redeemedRecord());
    mockGetProtocolInfoBatch.mockResolvedValue([
      { verifiedAt: 1_050n, claimExpiredUntil: 0n },
    ]);

    const { result, client } = renderCheck([VAULT_A]);

    await settled(client);
    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "redeemed",
      reason: undefined,
    });
  });

  it("keeps the reason through the redeem when the reason read fails", async () => {
    mockGetVaultBasicInfo.mockResolvedValue(expiredRecord());
    mockGetProtocolInfoBatch.mockResolvedValue([
      { verifiedAt: 1_050n, claimExpiredUntil: 3_000n },
    ]);
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetVaultBasicInfo.mockResolvedValue(redeemedRecord());
    mockGetProtocolInfoBatch.mockRejectedValue(new Error("rpc down"));
    await pollAgain(client);

    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "redeemed",
      reason: "activation_timeout",
    });
  });

  it("drops a reason it held when a good read says the vault was redeemed without expiring", async () => {
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetVaultBasicInfo.mockResolvedValue(redeemedRecord());
    mockGetProtocolInfoBatch.mockResolvedValue([
      { verifiedAt: 1_050n, claimExpiredUntil: 0n },
    ]);
    await pollAgain(client);

    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "redeemed",
      reason: undefined,
    });
  });

  it("does not read the chain with no candidates", () => {
    const { result } = renderCheck([]);

    expect(mockResolvePinnedReadBlock).not.toHaveBeenCalled();
    expect(mockGetVaultBasicInfo).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("concludes nothing from a first read that fails", async () => {
    mockGetVaultBasicInfo.mockRejectedValue(new Error("rpc down"));

    const { result, client } = renderCheck([VAULT_A]);

    await settled(client);
    expect(mockGetVaultBasicInfo).toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("does not read an empty record as a Pending vault past its ack deadline", async () => {
    mockGetVaultBasicInfo.mockResolvedValue({
      depositor: zeroAddress,
      createdAt: 0n,
      status: OnChainBtcVaultStatus.PENDING,
    });

    const { result, client } = renderCheck([VAULT_A]);

    await settled(client);
    expect(mockGetVaultBasicInfo).toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("keeps a vault's expiry when its next read fails", async () => {
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetVaultBasicInfo.mockRejectedValue(new Error("rpc down"));
    await pollAgain(client);

    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "unreported",
      reason: "activation_timeout",
    });
  });

  it("keeps a vault's expiry when its next read returns an empty record", async () => {
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetVaultBasicInfo.mockResolvedValue({
      depositor: zeroAddress,
      createdAt: 0n,
      status: OnChainBtcVaultStatus.PENDING,
    });
    await pollAgain(client);

    expect(result.current.size).toBe(1);
  });

  it("keeps a vault's expiry when the head read fails", async () => {
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockResolvePinnedReadBlock.mockRejectedValue(new Error("rpc down"));
    await pollAgain(client);

    expect(result.current.size).toBe(1);
  });

  it("keeps a vault's expiry when the params read fails", async () => {
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetPegInConfiguration.mockRejectedValue(new Error("invalid params"));
    await pollAgain(client);

    expect(result.current.size).toBe(1);
  });

  it("keeps a vault's expiry when a new candidate changes the id set and its read fails", async () => {
    const { result, rerender, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetVaultBasicInfo.mockRejectedValue(new Error("rpc down"));
    rerender({ ids: [VAULT_A, VAULT_B] });
    await settled(client);

    expect(mockGetVaultBasicInfo).toHaveBeenCalledWith(
      VAULT_B,
      BLOCK_PAST_DEADLINES,
    );
    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "unreported",
      reason: "activation_timeout",
    });
  });

  it("keeps a vault's expiry when the id set returns to one read before the vault expired", async () => {
    mockResolvePinnedReadBlock.mockResolvedValue(BLOCK_BEFORE_DEADLINES);
    const { result, rerender, client } = renderCheck([VAULT_A]);
    await settled(client);
    expect(result.current.size).toBe(0);

    mockResolvePinnedReadBlock.mockResolvedValue(BLOCK_PAST_DEADLINES);
    rerender({ ids: [VAULT_A, VAULT_B] });
    await settled(client);
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(true);

    rerender({ ids: [VAULT_A] });
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(true);
    await settled(client);
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(true);
  });

  it("keeps a vault's expiry when the id set returns to one read before the vault expired and its read fails", async () => {
    mockResolvePinnedReadBlock.mockResolvedValue(BLOCK_BEFORE_DEADLINES);
    const { result, rerender, client } = renderCheck([VAULT_A]);
    await settled(client);

    mockResolvePinnedReadBlock.mockResolvedValue(BLOCK_PAST_DEADLINES);
    rerender({ ids: [VAULT_A, VAULT_B] });
    await settled(client);
    expect(result.current.has(VAULT_A.toLowerCase())).toBe(true);

    // Two minutes on, a read of the earlier id set would be refetched.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    mockGetVaultBasicInfo.mockRejectedValue(new Error("rpc down"));
    rerender({ ids: [VAULT_A] });
    await settled(client);

    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "unreported",
      reason: "activation_timeout",
    });
  });

  it("clears an expiry when a raised timeout reopens the vault", async () => {
    const { result, client } = renderCheck([VAULT_A]);
    await waitFor(() => expect(result.current.size).toBe(1));

    mockGetPegInConfiguration.mockResolvedValue({
      pegInAckTimeout: ACK_TIMEOUT,
      pegInActivationTimeout: BLOCK_PAST_DEADLINES,
    });
    await pollAgain(client);

    expect(result.current.size).toBe(0);
  });

  it("drops a vault that left the candidate set", async () => {
    const { result, rerender } = renderCheck([VAULT_A, VAULT_B]);
    await waitFor(() => expect(result.current.size).toBe(2));

    rerender({ ids: [VAULT_B] });

    expect(result.current.has(VAULT_A.toLowerCase())).toBe(false);
    expect(result.current.has(VAULT_B.toLowerCase())).toBe(true);
  });

  it("never rejects, so an outage does not reach the global query error handler", async () => {
    mockResolvePinnedReadBlock.mockRejectedValue(new Error("rpc down"));

    const { client, onQueryError } = renderCheck([VAULT_A]);

    await settled(client);
    expect(mockResolvePinnedReadBlock).toHaveBeenCalled();
    expect(onQueryError).not.toHaveBeenCalled();
  });
});
