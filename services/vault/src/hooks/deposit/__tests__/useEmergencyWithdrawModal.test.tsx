import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VaultActivity } from "@/types/activity";

import { useEmergencyWithdrawModal } from "../useEmergencyWithdrawModal";

const PRE_PEGIN_TX = "0xabcdef";

function splitVault(
  id: string,
  constructionIndex: number,
  contractStatus: ContractStatus,
): VaultActivity {
  return {
    id,
    unsignedPrePeginTx: PRE_PEGIN_TX,
    constructionIndex,
    contractStatus,
  } as VaultActivity;
}

describe("useEmergencyWithdrawModal", () => {
  it.each(["proven", "not-proven"] as const)(
    "stores the stuck proof the opener states (%s)",
    (stuckProof) => {
      const first = splitVault("0x01", 0, ContractStatus.VERIFIED);
      const { result } = renderHook(() =>
        useEmergencyWithdrawModal({
          allActivities: [first],
          onSuccess: vi.fn(),
        }),
      );

      act(() => result.current.handleWithdrawClick(first, stuckProof));

      expect(result.current.withdrawing).toEqual({
        activity: first,
        stuckProof,
      });
    },
  );

  it("re-reads the split warning from the latest list once the later sibling stops being able to activate", () => {
    const first = splitVault("0x01", 0, ContractStatus.VERIFIED);
    const { result, rerender } = renderHook(
      ({ activities }) =>
        useEmergencyWithdrawModal({
          allActivities: activities,
          onSuccess: vi.fn(),
        }),
      {
        initialProps: {
          activities: [first, splitVault("0x02", 1, ContractStatus.VERIFIED)],
        },
      },
    );
    act(() => result.current.handleWithdrawClick(first, "not-proven"));
    expect(result.current.splitProtectionLost).toBe(true);

    rerender({
      activities: [first, splitVault("0x02", 1, ContractStatus.REDEEMED)],
    });

    expect(result.current.splitProtectionLost).toBe(false);
  });
});
