import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { SplitVaultOrderWarning } from "../SplitVaultOrderWarning";

const mocks = vi.hoisted(() => ({
  applyReorderedOrder: vi.fn(),
  executeReorder: vi.fn().mockResolvedValue(true),
  splitOrder: {
    expectedVaultIds: [] as string[],
    hasMismatch: false,
  },
}));

vi.mock("@/applications/aave/hooks/useSplitVaultOrder", () => ({
  useSplitVaultOrder: () => mocks.splitOrder,
}));

vi.mock("@/applications/aave/hooks/useReorderVaults", () => ({
  useReorderVaults: () => ({
    executeReorder: mocks.executeReorder,
    isProcessing: false,
    error: null,
  }),
}));

vi.mock("@/applications/aave/context", () => ({
  useReorderOverride: () => ({
    applyReorderedOrder: mocks.applyReorderedOrder,
  }),
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => ({ protocol: null, aave: null }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("SplitVaultOrderWarning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.splitOrder = { expectedVaultIds: [], hasMismatch: false };
  });

  it("stays hidden while the contract order matches construction order", () => {
    render(
      <SplitVaultOrderWarning
        currentVaultIds={["0xsacrificial", "0xprotected"]}
        onSuccess={vi.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(
      screen.queryByTestId("split-vault-order-warning"),
    ).not.toBeInTheDocument();
  });

  it("restores construction order from the blocking warning in one click", async () => {
    const current = ["0xprotected", "0xsacrificial"];
    const expected = ["0xsacrificial", "0xprotected"];
    const onSuccess = vi.fn();
    mocks.splitOrder = { expectedVaultIds: expected, hasMismatch: true };

    render(
      <SplitVaultOrderWarning
        currentVaultIds={current}
        onSuccess={onSuccess}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      COPY.vaults.splitOrderWarning.body,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.splitOrderWarning.action,
      }),
    );

    await waitFor(() => {
      expect(mocks.executeReorder).toHaveBeenCalledWith(expected, {
        expectedCurrentVaultIds: current,
      });
      expect(mocks.applyReorderedOrder).toHaveBeenCalledWith(expected);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
