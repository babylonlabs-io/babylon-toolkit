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
  ProxyMismatchError: class ProxyMismatchError extends Error {},
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

import { COPY } from "@/copy";

import { ProxyMismatchError } from "../../services";
import { useRepayTransaction } from "../useRepayTransaction";

const RESERVE_TOKEN = { address: "0xtoken", decimals: 6, symbol: "USDC" };
const RESERVE = {
  reserveId: "r1",
  token: RESERVE_TOKEN,
} as never;

function setup() {
  return renderHook(() => useRepayTransaction({ proxyContract: "0xproxy" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.value = { protocol: null, aave: null };
});

describe("useRepayTransaction — pause gating (either scope paused)", () => {
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

  it("blocks under a protocol-only pause — a protocol pause is a full stop", async () => {
    gateMock.value = { protocol: "paused", aave: null };
    const { result } = setup();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE);
    });

    expect(resolved).toBe(false);
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockRepayAll).not.toHaveBeenCalled();
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
      RESERVE_TOKEN,
    );
  });
});

describe("useRepayTransaction — proxy integrity (F8)", () => {
  it("maps a ProxyMismatchError to the integrity copy and returns false", async () => {
    mockAssertReserve.mockResolvedValueOnce(undefined);
    mockRepayAll.mockRejectedValueOnce(
      new ProxyMismatchError("proxy mismatch"),
    );
    const { result } = setup();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe(false);
    expect(result.current.error).toBe(COPY.loans.repay.integrityError);
  });
});
