import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBorrow = vi.fn();
const mockAssertReserve = vi.fn();
vi.mock("../../services", () => ({
  borrow: (...a: unknown[]) => mockBorrow(...a),
  assertReserveMatchesOnChain: (...a: unknown[]) => mockAssertReserve(...a),
  ReserveMismatchError: class ReserveMismatchError extends Error {},
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => "0xadapter",
}));

vi.mock("@/clients/eth-contract", () => ({
  ERC20: { getERC20Decimals: vi.fn() },
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("wagmi", () => ({
  useWalletClient: () => ({ data: { account: { address: "0xuser" } } }),
  useAccount: () => ({ address: "0xuser" }),
}));

// Local override of the global gate mock so we can drive a paused aave scope.
const gateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

import { useBorrowTransaction } from "../useBorrowTransaction";

const RESERVE = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.value = { protocol: null, aave: null };
});

describe("useBorrowTransaction — pause gating", () => {
  it("refuses to broadcast when an aave Freeze/Pause blocks borrow (before any on-chain read)", async () => {
    gateMock.value = { protocol: null, aave: "paused" };
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, RESERVE);
    });

    expect(resolved).toBe(false);
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockBorrow).not.toHaveBeenCalled();
  });
});
