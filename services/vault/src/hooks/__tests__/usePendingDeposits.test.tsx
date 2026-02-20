/**
 * Tests for usePendingDeposits hook
 *
 * Validates the pending-deposit filtering logic and the shape of the
 * returned data (hasPendingDeposits flag, modal handlers, wallet state).
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractStatus } from "@/models/peginStateMachine";

import { usePendingDeposits } from "../usePendingDeposits";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockRefetchActivities = vi.fn();

vi.mock("@/context/wallet", () => ({
  useBTCWallet: vi.fn(() => ({ connected: true, address: "bc1qtest" })),
  useETHWallet: vi.fn(() => ({ address: "0xethtest" })),
}));

vi.mock("@/hooks/useBtcPublicKey", () => ({
  useBtcPublicKey: vi.fn(() => "btcpubkey123"),
}));

const mockActivities = vi.fn((): any[] => []);

vi.mock("@/hooks/useVaultDeposits", () => ({
  useVaultDeposits: vi.fn(() => ({
    activities: mockActivities(),
    pendingPegins: [],
    refetchActivities: mockRefetchActivities,
  })),
}));

vi.mock("@/hooks/deposit/useAllDepositProviders", () => ({
  useAllDepositProviders: vi.fn(() => ({ vaultProviders: [] })),
}));

vi.mock("@/hooks/deposit/usePayoutSignModal", () => ({
  usePayoutSignModal: vi.fn(() => ({
    isOpen: false,
    signingActivity: null,
    signingTransactions: null,
    handleSignClick: vi.fn(),
    handleClose: vi.fn(),
    handleSuccess: vi.fn(),
  })),
}));

vi.mock("@/hooks/deposit/useBroadcastModal", () => ({
  useBroadcastModal: vi.fn(() => ({
    broadcastingActivity: null,
    handleBroadcastClick: vi.fn(),
    handleClose: vi.fn(),
    handleSuccess: vi.fn(),
    successOpen: false,
    successAmount: "",
    handleSuccessClose: vi.fn(),
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeActivity(
  id: string,
  contractStatus: ContractStatus,
  amount = "0.1",
) {
  return {
    id,
    contractStatus,
    collateral: { amount },
    providers: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("usePendingDeposits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(result.current.btcPublicKey).toBe("btcpubkey123");
  });

  it("returns sign and broadcast modal handlers", () => {
    const { result } = renderHook(() => usePendingDeposits());

    expect(result.current.signModal).toBeDefined();
    expect(result.current.signModal.handleSignClick).toBeInstanceOf(Function);
    expect(result.current.broadcastModal).toBeDefined();
    expect(result.current.broadcastModal.handleBroadcastClick).toBeInstanceOf(
      Function,
    );
  });
});
