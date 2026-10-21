/**
 * Tests for usePendingDeposits hook
 *
 * Validates the pending-deposit filtering logic and the shape of the
 * returned data (hasPendingDeposits flag, modal handlers, wallet state).
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBTCWallet } from "@/context/wallet";
import { useVaultDeposits } from "@/hooks/useVaultDeposits";
import { ContractStatus } from "@/models/peginStateMachine";

import { usePendingDeposits } from "../usePendingDeposits";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockRefetchActivities = vi.fn();

vi.mock("@/context/wallet", () => ({
  useBTCWallet: vi.fn(() => ({ connected: true, address: "bc1qtest" })),
  useETHWallet: vi.fn(() => ({ address: "0xethtest" })),
}));

const mockActivities = vi.fn((): any[] => []);

vi.mock("@/hooks/useVaultDeposits", () => ({
  useVaultDeposits: vi.fn(() => ({
    activities: mockActivities(),
    refetchActivities: mockRefetchActivities,
  })),
}));

vi.mock("@/hooks/deposit/useAllDepositProviders", () => ({
  useAllDepositProviders: vi.fn(() => ({ vaultProviders: [] })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeActivity(
  id: string,
  contractStatus: ContractStatus,
  amount = "0.1",
  unsignedPrePeginTx?: string,
) {
  return {
    id,
    contractStatus,
    collateral: { amount },
    providers: [],
    unsignedPrePeginTx,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("usePendingDeposits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBTCWallet).mockReset();
    mockActivities.mockReturnValue([]);
  });

  it("returns hasPendingDeposits=false when there are no activities", () => {
    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.hasPendingDeposits).toBe(false);
    expect(result.current.pendingActivities).toHaveLength(0);
  });

  it("filters to only PENDING (0) and VERIFIED (1) activities", () => {
    mockActivities.mockReturnValue([
      makeActivity("a1", ContractStatus.PENDING),
      makeActivity("a2", ContractStatus.VERIFIED),
      makeActivity("a3", ContractStatus.ACTIVE),
      makeActivity("a4", ContractStatus.REDEEMED),
      makeActivity("a5", ContractStatus.LIQUIDATED),
    ]);

    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.pendingActivities).toHaveLength(2);
    expect(result.current.pendingActivities.map((a: any) => a.id)).toEqual([
      "a1",
      "a2",
    ]);
    expect(result.current.hasPendingDeposits).toBe(true);
  });

  it("returns hasPendingDeposits=false when all activities are past pending stage", () => {
    mockActivities.mockReturnValue([
      makeActivity("a1", ContractStatus.ACTIVE),
      makeActivity("a2", ContractStatus.REDEEMED),
    ]);

    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.hasPendingDeposits).toBe(false);
    expect(result.current.pendingActivities).toHaveLength(0);
  });

  it("includes all activities in allActivities regardless of status", () => {
    const all = [
      makeActivity("a1", ContractStatus.PENDING),
      makeActivity("a2", ContractStatus.ACTIVE),
      makeActivity("a3", ContractStatus.REDEEMED),
    ];
    mockActivities.mockReturnValue(all);

    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.allActivities).toHaveLength(3);
  });

  it("returns wallet state from context hooks", () => {
    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.btcAddress).toBe("bc1qtest");
    expect(result.current.ethAddress).toBe("0xethtest");
  });

  it("routes expired records by unsigned transaction and enables flags with Bitcoin connected", () => {
    mockActivities.mockReturnValue([
      makeActivity("a1", ContractStatus.PENDING),
      makeActivity("a2", ContractStatus.EXPIRED, "0.1", "0200000001abcd"),
      makeActivity("a3", ContractStatus.EXPIRED, "0.1"),
    ]);

    const wallet = vi.mocked(useBTCWallet);
    const currentWallet = wallet();
    wallet.mockReturnValue({ ...currentWallet, connected: true });
    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.pendingActivities.map((a) => a.id)).toEqual(["a1"]);
    expect(result.current.expiredActivities.map((a) => a.id)).toEqual(["a2"]);
    expect(result.current.hasPendingDeposits).toBe(true);
    expect(result.current.hasExpiredDeposits).toBe(true);
    expect(useVaultDeposits).toHaveBeenCalledWith("0xethtest");
  });

  it("routes expired records by unsigned transaction and disables flags with Bitcoin disconnected", () => {
    mockActivities.mockReturnValue([
      makeActivity("a1", ContractStatus.PENDING),
      makeActivity("a2", ContractStatus.EXPIRED, "0.1", "0200000001abcd"),
      makeActivity("a3", ContractStatus.EXPIRED, "0.1"),
    ]);

    const wallet = vi.mocked(useBTCWallet);
    const currentWallet = wallet();
    wallet.mockReturnValue({ ...currentWallet, connected: false });
    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.pendingActivities.map((a) => a.id)).toEqual(["a1"]);
    expect(result.current.expiredActivities.map((a) => a.id)).toEqual(["a2"]);
    expect(result.current.hasPendingDeposits).toBe(false);
    expect(result.current.hasExpiredDeposits).toBe(false);
    expect(useVaultDeposits).toHaveBeenCalledWith("0xethtest");
  });

  it("lists withdrawn and keeper-claimed vaults with a signed PegIn as reclaim candidates", () => {
    mockActivities.mockReturnValue([
      {
        ...makeActivity("w1", ContractStatus.DEPOSITOR_WITHDRAWN),
        depositorSignedPeginTx: "0200000001abcd",
      },
      {
        ...makeActivity("k1", ContractStatus.NON_DEPOSITOR_SPEND),
        depositorSignedPeginTx: "0200000001abcd",
      },
      // No indexer copy of the signed PegIn: nothing to probe on Bitcoin.
      makeActivity("k2", ContractStatus.NON_DEPOSITOR_SPEND),
      // Still redeeming: the vault output is unspent, so no reserve to sweep.
      makeActivity("r1", ContractStatus.REDEEMED),
    ]);

    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.reclaimableCandidates.map((a) => a.id)).toEqual([
      "w1",
      "k1",
    ]);
  });
});
