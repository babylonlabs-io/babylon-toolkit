import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertReserve = vi.fn();
const mockRepayAll = vi.fn();
const mockRepayPartial = vi.fn();
vi.mock("../../services", () => ({
  assertReserveMatchesOnChain: (...a: unknown[]) => mockAssertReserve(...a),
  repayAll: (...a: unknown[]) => mockRepayAll(...a),
  repayPartial: (...a: unknown[]) => mockRepayPartial(...a),
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

// Local override of the global gate mock so we can drive a paused scope.
const gateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

import { useRepayTransaction } from "../useRepayTransaction";

const RESERVE = {
  reserveId: "r1",
  token: { address: "0xtoken", decimals: 6, symbol: "USDC" },
} as never;

function setup() {
  return renderHook(() => useRepayTransaction({ proxyContract: "0xproxy" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.value = { protocol: null, aave: null };
});

describe("useRepayTransaction — pause gating (aave-scope only)", () => {
  it("returns false without any on-chain read when the aave scope is paused", async () => {
    gateMock.value = { protocol: null, aave: "paused" };
    const { result } = setup();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE);
    });

    expect(resolved).toBe(false);
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockRepayAll).not.toHaveBeenCalled();
  });

  it("PROCEEDS under a protocol-only pause — repay must stay available so a near-liquidation user can de-risk", async () => {
    // protocol paused, aave normal → repay is NOT blocked. Stop the flow at the
    // reserve check (rejected stub) and assert it was reached, proving the gate
    // let execution through. A mis-wire to isWithdrawBlocked would block here.
    gateMock.value = { protocol: "paused", aave: null };
    mockAssertReserve.mockRejectedValueOnce(new Error("stub reserve"));
    const { result } = setup();

    await act(async () => {
      await result.current.executeRepay(100, RESERVE);
    });

    expect(mockAssertReserve).toHaveBeenCalledTimes(1);
  });
});

describe("useRepayTransaction — max mode wiring", () => {
  it("fails without calling repayAll when proxyContract is missing", async () => {
    const { result } = renderHook(() =>
      useRepayTransaction({ proxyContract: undefined }),
    );

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe(false);
    expect(result.current.error).toContain("position data not available");
    expect(mockRepayAll).not.toHaveBeenCalled();
  });

  it("refuses max mode without the exact bigint balance", async () => {
    const { result } = setup();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max");
    });

    expect(resolved).toBe(false);
    expect(result.current.error).toContain("requires repayAmountRaw");
    expect(mockRepayAll).not.toHaveBeenCalled();
  });

  it("passes the proxy, exact balance bigint, and token through to repayAll", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockRepayAll.mockResolvedValue({ transactionHash: "0xhash" });
    const { result } = setup();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe(true);
    expect(mockRepayAll).toHaveBeenCalledWith(
      expect.anything(), // wallet client
      expect.anything(), // chain
      "r1",
      "0xtoken",
      "0xproxy",
      123n,
      RESERVE.token,
    );
  });
});
