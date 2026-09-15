import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWithdraw = vi.fn();
vi.mock("../../services", () => ({
  withdrawSelectedCollateral: (...args: unknown[]) => mockWithdraw(...args),
}));

const mockMarkVaultsAsPending = vi.fn();
vi.mock("../../context", () => ({
  usePendingVaults: () => ({
    markVaultsAsPending: mockMarkVaultsAsPending,
  }),
}));

vi.mock("wagmi", () => ({
  useWalletClient: () => ({ data: { account: { address: "0xuser" } } }),
  useAccount: () => ({ address: "0xuser" }),
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn() },
}));

import { useWithdrawCollateralTransaction } from "../useWithdrawCollateralTransaction";

const VAULT_ID =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001";

const POSITION_KEY = [
  "aaveUserPosition",
  "0xUser",
  "0xspoke",
  "3",
  ["7"],
] as const;

function setup() {
  const client = new QueryClient();
  client.setQueryData(POSITION_KEY, "cached");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useWithdrawCollateralTransaction(), { wrapper }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWithdraw.mockResolvedValue({ transactionHash: "0xtx", receipt: {} });
});

describe("useWithdrawCollateralTransaction", () => {
  it("invalidates the Aave position once the withdrawal is mined", async () => {
    const { client, result } = setup();

    await act(async () => {
      await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(true);
  });

  it("marks the withdrawn vault pending so the list can show it withdrawing", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(mockMarkVaultsAsPending).toHaveBeenCalledWith(
      [VAULT_ID],
      "withdraw",
    );
  });

  it("leaves the position query untouched when the transaction reverts", async () => {
    mockWithdraw.mockRejectedValue(new Error("execution reverted"));
    const { client, result } = setup();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(resolved).toBe(false);
    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(false);
    expect(mockMarkVaultsAsPending).not.toHaveBeenCalled();
  });
});
