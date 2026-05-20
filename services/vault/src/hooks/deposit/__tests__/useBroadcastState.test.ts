import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalStorageStatus } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { useBroadcastState } from "../useBroadcastState";

const mockVaultHandleBroadcast = vi.fn();
const mockSetOptimisticStatus = vi.fn();
const mockUpdatePendingPeginStatus = vi.fn();

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
  logger: { error: vi.fn() },
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

  it("marks every batch sibling CONFIRMING after a successful broadcast", async () => {
    // A batched broadcast confirms every sibling at once — the success
    // callback must propagate CONFIRMING to all of them, not just the
    // clicked vault.
    mockVaultHandleBroadcast.mockImplementation(
      async (params: { onShowSuccessModal: () => void }) => {
        params.onShowSuccessModal();
      },
    );
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useBroadcastState({
        activity: activity("0xa"),
        batchVaultIds: ["0xa", "0xb"],
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
    expect(onSuccess).toHaveBeenCalledOnce();
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
});
