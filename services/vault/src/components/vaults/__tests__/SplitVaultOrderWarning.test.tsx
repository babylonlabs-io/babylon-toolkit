import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { SplitVaultOrderWarning } from "../SplitVaultOrderWarning";

const mocks = vi.hoisted(() => ({
  applyReorderedOrder: vi.fn(),
  executeReorder: vi.fn().mockResolvedValue(true),
  calculate: vi.fn(),
  splitOrder: {
    expectedVaultIds: [] as string[] | null,
    hasMismatch: false,
    isError: false,
  },
  params: null as {
    vaults: { id: string; btc: number; name: string }[];
  } | null,
}));

vi.mock("@/applications/aave/hooks/useSplitVaultOrder", () => ({
  useSplitVaultOrder: () => mocks.splitOrder,
}));

vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => ({ params: mocks.params }),
}));

vi.mock("@/applications/aave/positionNotifications", () => ({
  calculate: mocks.calculate,
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
    mocks.executeReorder.mockResolvedValue(true);
    mocks.splitOrder = {
      expectedVaultIds: [],
      hasMismatch: false,
      isError: false,
    };
    mocks.params = null;
  });

  it("stays hidden while the contract order matches construction order", () => {
    render(
      <SplitVaultOrderWarning
        connectedAddress="0xuser"
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
    mocks.splitOrder = {
      expectedVaultIds: expected,
      hasMismatch: true,
      isError: false,
    };

    render(
      <SplitVaultOrderWarning
        connectedAddress="0xuser"
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

  it("disables the restore action after a successful repair of this queue", async () => {
    mocks.splitOrder = {
      expectedVaultIds: ["0xsacrificial", "0xprotected"],
      hasMismatch: true,
      isError: false,
    };

    render(
      <SplitVaultOrderWarning
        connectedAddress="0xuser"
        currentVaultIds={["0xprotected", "0xsacrificial"]}
        onSuccess={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    const button = screen.getByRole("button", {
      name: COPY.vaults.splitOrderWarning.action,
    });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
  });

  it("warns that the order is unverified when the registry read fails", () => {
    mocks.splitOrder = {
      expectedVaultIds: null,
      hasMismatch: false,
      isError: true,
    };

    render(
      <SplitVaultOrderWarning
        connectedAddress="0xuser"
        currentVaultIds={["0xprotected", "0xsacrificial"]}
        onSuccess={vi.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      COPY.vaults.splitOrderWarning.unverifiedBody,
    );
  });

  it("stays hidden when the optimizer would move away from construction order", () => {
    mocks.splitOrder = {
      expectedVaultIds: ["0xsacrificial", "0xprotected"],
      hasMismatch: true,
      isError: false,
    };
    mocks.params = {
      vaults: [
        { id: "0xprotected", btc: 0.9, name: "protected" },
        { id: "0xsacrificial", btc: 0.1, name: "sacrificial" },
      ],
    };
    mocks.calculate.mockReturnValue({ optimalVaultOrder: [] });

    render(
      <SplitVaultOrderWarning
        connectedAddress="0xuser"
        currentVaultIds={["0xprotected", "0xsacrificial"]}
        onSuccess={vi.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(mocks.calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        vaults: [
          { id: "0xsacrificial", btc: 0.1, name: "sacrificial" },
          { id: "0xprotected", btc: 0.9, name: "protected" },
        ],
      }),
    );
    expect(
      screen.queryByTestId("split-vault-order-warning"),
    ).not.toBeInTheDocument();
  });
});
