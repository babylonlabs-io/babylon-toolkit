/**
 * Tests for useReorderModal — verifies the modal-open baseline (vault order
 * and amounts) is captured, preserved across drag, and threaded into
 * executeReorder so the signing-time guards can detect concurrent live-state
 * changes and bind the reviewed amounts to the registry.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CollateralVaultEntry } from "@/types/collateral";

const mockExecuteReorder = vi.fn();
vi.mock("@/applications/aave/hooks", () => ({
  useReorderVaults: () => ({
    executeReorder: mockExecuteReorder,
    isProcessing: false,
    pendingWrite: null,
    error: null,
    notice: null,
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
    lifecycle: "active",
    vaultId,
    amountBtc: 0.5,
    amountSats: 50_000_000n,
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

describe("useReorderModal — baseline capture for the signing-time guards", () => {
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
      kind: "manual",
      expectedCurrentVaults: [
        { vaultId: VAULT_A_ID, amountSats: 50_000_000n },
        { vaultId: VAULT_B_ID, amountSats: 50_000_000n },
      ],
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
      kind: "manual",
      expectedCurrentVaults: [
        { vaultId: VAULT_A_ID, amountSats: 50_000_000n },
        { vaultId: VAULT_B_ID, amountSats: 50_000_000n },
      ],
    });
  });

  it("forwards the modal-open amounts, not the amounts of a refetch that arrives while the modal stays open", async () => {
    // An indexer refetch relabels A's amount while the modal is open. The
    // user still sees the modal-open amount, so that is what the signing
    // guard must bind to the registry.
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

    rerender({
      vaults: [
        { ...VAULT_A, amountBtc: 0.7, amountSats: 70_000_000n },
        VAULT_B,
      ],
      isOpen: true,
    });

    await act(async () => {
      await result.current.handleConfirm();
    });

    const [, options] = mockExecuteReorder.mock.calls[0];
    expect(options).toEqual({
      kind: "manual",
      expectedCurrentVaults: [
        { vaultId: VAULT_A_ID, amountSats: 50_000_000n },
        { vaultId: VAULT_B_ID, amountSats: 50_000_000n },
      ],
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
      kind: "manual",
      expectedCurrentVaults: [
        { vaultId: VAULT_C_ID, amountSats: 50_000_000n },
        { vaultId: VAULT_A_ID, amountSats: 50_000_000n },
      ],
    });
  });
});
