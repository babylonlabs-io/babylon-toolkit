import { act, renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { useBroadcastState } from "../useBroadcastState";

const mockVaultHandleBroadcast = vi.fn();
const mockSetOptimisticStatus = vi.fn();
const mockUpdatePendingPeginStatus = vi.fn();
// Hoisted: referenced inside the hoisted vi.mock("@/infrastructure") factory,
// which runs before this module's plain const initializers.
const mockLoggerEvent = vi.hoisted(() => vi.fn());

vi.mock("../useVaultActions", () => ({
  useVaultActions: () => ({
    broadcasting: false,
    broadcastError: null,
    handleBroadcast: mockVaultHandleBroadcast,
  }),
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ setOptimisticStatus: mockSetOptimisticStatus }),
}));

vi.mock("@/storage/usePeginStorage", () => ({
  usePeginStorage: () => ({
    pendingPegins: [],
    updatePendingPeginStatus: mockUpdatePendingPeginStatus,
  }),
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn(), event: mockLoggerEvent },
}));

function activity(id: string): VaultActivity {
  return {
    id: id as VaultActivity["id"],
    collateral: { amount: "0.01", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    displayLabel: "Pending" as VaultActivity["displayLabel"],
    unsignedPrePeginTx: "0xdeadbeef",
    depositorWotsPkHash: "0xwots",
  };
}

describe("useBroadcastState — batched broadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks only the chain-verified batch siblings CONFIRMING after a successful broadcast", async () => {
    // "0xc" is a listed stranger; "0xB" proves membership is by sameHex
    // while the storage keys stay the prop's raw strings.
    mockVaultHandleBroadcast.mockImplementation(
      async (params: {
        onShowSuccessModal: (outcome: {
          confirmedVaultIds: readonly Hex[];
        }) => void;
      }) => {
        params.onShowSuccessModal({ confirmedVaultIds: ["0xa", "0xB"] });
      },
    );
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useBroadcastState({
        activity: activity("0xa"),
        batchVaultIds: ["0xa", "0xb", "0xc"],
        depositorEthAddress: "0xdepositor",
        onSuccess,
      }),
    );

    await act(async () => {
      await result.current.handleBroadcast();
    });

    for (const id of ["0xa", "0xb"]) {
      expect(mockUpdatePendingPeginStatus).toHaveBeenCalledWith(
        id,
        LocalStorageStatus.CONFIRMING,
      );
      expect(mockSetOptimisticStatus).toHaveBeenCalledWith(
        id,
        LocalStorageStatus.CONFIRMING,
      );
    }
    expect(mockUpdatePendingPeginStatus).toHaveBeenCalledTimes(2);
    expect(mockSetOptimisticStatus).toHaveBeenCalledTimes(2);
    expect(mockUpdatePendingPeginStatus).not.toHaveBeenCalledWith(
      "0xc",
      expect.anything(),
    );
    expect(mockSetOptimisticStatus).not.toHaveBeenCalledWith(
      "0xc",
      expect.anything(),
    );
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(["0xa", "0xb"]);
  });

  it("emits a broadcast.succeeded milestone per verified sibling, not per listed id", async () => {
    // One milestone per verified sibling; none for the listed stranger.
    mockVaultHandleBroadcast.mockImplementation(
      async (params: {
        onShowSuccessModal: (outcome: {
          confirmedVaultIds: readonly Hex[];
        }) => void;
      }) => {
        params.onShowSuccessModal({ confirmedVaultIds: ["0xa", "0xb"] });
      },
    );

    const { result } = renderHook(() =>
      useBroadcastState({
        activity: activity("0xa"),
        batchVaultIds: ["0xa", "0xb", "0xc"],
        depositorEthAddress: "0xdepositor",
        onSuccess: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleBroadcast();
    });

    const broadcastEmits = mockLoggerEvent.mock.calls.filter(
      ([name]) => name === TELEMETRY_EVENT.DEPOSIT_BROADCAST_SUCCEEDED,
    );
    expect(broadcastEmits).toHaveLength(2);
    expect(broadcastEmits.map(([, ctx]) => ctx.tags.vaultId)).toEqual([
      "0xa",
      "0xb",
    ]);
    expect(broadcastEmits.map(([, ctx]) => ctx.vaultCount)).toEqual([2, 2]);
  });

  it("broadcasts the shared transaction once for the whole batch", () => {
    mockVaultHandleBroadcast.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useBroadcastState({
        activity: activity("0xa"),
        batchVaultIds: ["0xa", "0xb"],
        depositorEthAddress: "0xdepositor",
        onSuccess: vi.fn(),
      }),
    );

    act(() => {
      void result.current.handleBroadcast();
    });

    expect(mockVaultHandleBroadcast).toHaveBeenCalledTimes(1);
    expect(mockVaultHandleBroadcast.mock.calls[0][0].vaultId).toBe("0xa");
  });

  it("hands every batch vault to the broadcast so the capacity check sizes the whole batch", async () => {
    mockVaultHandleBroadcast.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useBroadcastState({
        activity: activity("0xa"),
        batchVaultIds: ["0xa", "0xb"],
        depositorEthAddress: "0xdepositor",
        onSuccess: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleBroadcast();
    });

    expect(mockVaultHandleBroadcast.mock.calls[0][0].batchVaultIds).toEqual([
      "0xa",
      "0xb",
    ]);
  });

  it("retries with the batch from the latest props, not the first attempt's", async () => {
    mockVaultHandleBroadcast.mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ batchVaultIds }) =>
        useBroadcastState({
          activity: activity("0xa"),
          batchVaultIds,
          depositorEthAddress: "0xdepositor",
          onSuccess: vi.fn(),
        }),
      { initialProps: { batchVaultIds: ["0xa"] } },
    );

    await act(async () => {
      await result.current.handleBroadcast();
    });
    rerender({ batchVaultIds: ["0xa", "0xb"] });
    await act(async () => {
      await result.current.handleBroadcast();
    });

    expect(mockVaultHandleBroadcast.mock.calls[0][0].batchVaultIds).toEqual([
      "0xa",
    ]);
    expect(mockVaultHandleBroadcast.mock.calls[1][0].batchVaultIds).toEqual([
      "0xa",
      "0xb",
    ]);
  });
});
