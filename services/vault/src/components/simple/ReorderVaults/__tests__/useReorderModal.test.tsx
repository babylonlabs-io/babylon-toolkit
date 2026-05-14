/**
 * Tests for useReorderModal — verifies the modal-open baseline is
 * captured, preserved across drag, and threaded into executeReorder so
 * the signing-time guard can detect concurrent live-state changes.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CollateralVaultEntry } from "@/types/collateral";

const mockExecuteReorder = vi.fn();
vi.mock("@/applications/aave/hooks", () => ({
  useReorderVaults: () => ({
    executeReorder: mockExecuteReorder,
    isProcessing: false,
  }),
}));

import { useReorderModal } from "../useReorderModal";

const VAULT_A_ID =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001";
const VAULT_B_ID =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002";
const VAULT_C_ID =
  "0xcccc000000000000000000000000000000000000000000000000000000000003";

function makeVault(
  id: string,
  vaultId: string,
  liquidationIndex: number,
): CollateralVaultEntry {
  return {
    id,
    vaultId,
    amountBtc: 0.5,
    addedAt: 0,
    inUse: true,
    providerAddress: "0xprovider",
    providerName: "Test VP",
    liquidationIndex,
  };
}

const VAULT_A = makeVault("a", VAULT_A_ID, 0);
const VAULT_B = makeVault("b", VAULT_B_ID, 1);
const VAULT_C = makeVault("c", VAULT_C_ID, 2);

describe("useReorderModal — baseline capture for the #262 guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteReorder.mockResolvedValue(true);
  });

  it("forwards the modal-open baseline unchanged after the user drags", async () => {
    const { result } = renderHook(
      ({
        vaults,
        isOpen,
      }: {
        vaults: CollateralVaultEntry[];
        isOpen: boolean;
      }) => useReorderModal({ vaults, isOpen }),
      { initialProps: { vaults: [VAULT_A, VAULT_B], isOpen: true } },
    );

    // Simulate a drag: swap A and B in the user's ordered list.
    act(() => {
      result.current.handleDragEnd({
        active: { id: "a" },
        over: { id: "b" },
      } as unknown as Parameters<typeof result.current.handleDragEnd>[0]);
    });

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(mockExecuteReorder).toHaveBeenCalledTimes(1);
    const [submittedIds, options] = mockExecuteReorder.mock.calls[0];
    expect(submittedIds).toEqual([VAULT_B_ID, VAULT_A_ID]);
    expect(options).toEqual({
      expectedCurrentVaultIds: [VAULT_A_ID, VAULT_B_ID],
    });
  });

  it("does not update the baseline when `vaults` prop changes while the modal stays open", async () => {
    // Indexer refetch produces a different list while modal is open.
    // The baseline must NOT follow it — it represents what the user
    // reviewed at modal-open.
    const { result, rerender } = renderHook(
      ({
        vaults,
        isOpen,
      }: {
        vaults: CollateralVaultEntry[];
        isOpen: boolean;
      }) => useReorderModal({ vaults, isOpen }),
      { initialProps: { vaults: [VAULT_A, VAULT_B], isOpen: true } },
    );

    rerender({ vaults: [VAULT_C, VAULT_A, VAULT_B], isOpen: true });

    await act(async () => {
      await result.current.handleConfirm();
    });

    const [, options] = mockExecuteReorder.mock.calls[0];
    expect(options).toEqual({
      expectedCurrentVaultIds: [VAULT_A_ID, VAULT_B_ID],
    });
  });

  it("re-snapshots the baseline when the modal closes and reopens", async () => {
    const { result, rerender } = renderHook(
      ({
        vaults,
        isOpen,
      }: {
        vaults: CollateralVaultEntry[];
        isOpen: boolean;
      }) => useReorderModal({ vaults, isOpen }),
      { initialProps: { vaults: [VAULT_A, VAULT_B], isOpen: true } },
    );

    // Close.
    rerender({ vaults: [VAULT_A, VAULT_B], isOpen: false });
    // Reopen with a different vault set.
    rerender({ vaults: [VAULT_C, VAULT_A], isOpen: true });

    await act(async () => {
      await result.current.handleConfirm();
    });

    const [, options] = mockExecuteReorder.mock.calls[0];
    expect(options).toEqual({
      expectedCurrentVaultIds: [VAULT_C_ID, VAULT_A_ID],
    });
  });
});
