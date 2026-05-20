import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VaultActivity } from "@/types/activity";

import { useBroadcastModal } from "../useBroadcastModal";

function activity(
  id: string,
  unsignedPrePeginTx: string,
  amount: string,
): VaultActivity {
  return {
    id: id as VaultActivity["id"],
    collateral: { amount, symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    displayLabel: "Pending" as VaultActivity["displayLabel"],
    unsignedPrePeginTx,
    depositorWotsPkHash: "0xwots",
  };
}

describe("useBroadcastModal", () => {
  it("resolves every sibling sharing the Pre-PegIn when a batched vault is clicked", () => {
    const a = activity("0xa", "0xshared", "0.05");
    const b = activity("0xb", "0xshared", "0.03");
    const c = activity("0xc", "0xother", "0.10");

    const { result } = renderHook(() =>
      useBroadcastModal({ allActivities: [a, b, c], onSuccess: vi.fn() }),
    );

    act(() => result.current.handleBroadcastClick("0xa"));

    expect(result.current.broadcastingActivity).toBe(a);
    expect(result.current.broadcastingBatchIds).toEqual(["0xa", "0xb"]);
    expect(result.current.isOpen).toBe(true);
  });

  it("resolves a single-vault batch for a standalone deposit", () => {
    const a = activity("0xa", "0xshared", "0.05");
    const c = activity("0xc", "0xother", "0.10");

    const { result } = renderHook(() =>
      useBroadcastModal({ allActivities: [a, c], onSuccess: vi.fn() }),
    );

    act(() => result.current.handleBroadcastClick("0xc"));

    expect(result.current.broadcastingBatchIds).toEqual(["0xc"]);
  });

  it("sums the batch amounts for the success modal", () => {
    const onSuccess = vi.fn();
    const a = activity("0xa", "0xshared", "0.05");
    const b = activity("0xb", "0xshared", "0.03");

    const { result } = renderHook(() =>
      useBroadcastModal({ allActivities: [a, b], onSuccess }),
    );

    act(() => result.current.handleBroadcastClick("0xa"));
    act(() => result.current.handleSuccess());

    expect(result.current.successAmount).toBe("0.08");
    expect(result.current.successOpen).toBe(true);
    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
