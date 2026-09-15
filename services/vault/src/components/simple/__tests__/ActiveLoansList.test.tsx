import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ActiveLoanRow } from "@/applications/aave/hooks";
import { COPY } from "@/copy";

vi.mock("@babylonlabs-io/core-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/core-ui")>()),
  Hint: ({ tooltip }: { tooltip?: ReactNode }) => <span>{tooltip}</span>,
}));

import { ActiveLoansList } from "../ActiveLoansList";

function makeRow(overrides: Partial<ActiveLoanRow> = {}): ActiveLoanRow {
  return {
    reserveId: "1",
    symbol: "USDC",
    name: "USD Coin",
    hub: {
      source: "registry",
      address: "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca",
      label: "Core Hub",
    },
    amount: "1.00",
    icon: "https://example.com/usdc.svg",
    borrowRate: "5.861%",
    availableLiquidity: 1000,
    utilizationBps: 5000,
    isBorrowable: true,
    ...overrides,
  };
}

describe("ActiveLoansList — per-row Borrow-more gating", () => {
  it("disables the Borrow-more button for a non-borrowable reserve while keeping Repay enabled", () => {
    render(
      <ActiveLoansList
        rows={[makeRow({ isBorrowable: false })]}
        canBorrow
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Borrow more" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Repay" })).toBeEnabled();
  });

  it("enables the Borrow-more button for a borrowable reserve when capacity remains", () => {
    render(
      <ActiveLoansList
        rows={[makeRow({ isBorrowable: true })]}
        canBorrow
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Borrow more" })).toBeEnabled();
  });

  it("disables the Borrow-more button when there is no borrow capacity, even for a borrowable reserve", () => {
    render(
      <ActiveLoansList
        rows={[makeRow({ isBorrowable: true })]}
        canBorrow={false}
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Borrow more" })).toBeDisabled();
  });

  // A `displayOnly` row is a god-mode demo mock: its symbol resolves to no
  // reserve, so neither action may reach the real borrow/repay overlay.
  it("disables both actions for a display-only (god-mode demo) row", () => {
    const onBorrow = vi.fn();
    const onRepay = vi.fn();
    render(
      <ActiveLoansList
        rows={[makeRow({ isBorrowable: true, displayOnly: true })]}
        canBorrow
        onBorrow={onBorrow}
        onRepay={onRepay}
      />,
    );

    expect(screen.getByRole("button", { name: "Borrow more" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  });
});

describe("ActiveLoansList — hub column", () => {
  it("names each loan's hub, so one token owed to two hubs reads as two loans", () => {
    render(
      <ActiveLoansList
        rows={[
          makeRow({ reserveId: "4" }),
          makeRow({
            reserveId: "0",
            hub: {
              source: "registry",
              address: "0xb3283508a0E96F80CF79DC2a1135F10dA170138D",
              label: "Babylon Hub",
            },
          }),
        ]}
        canBorrow
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByTestId("active-loan-row-4")).toHaveTextContent(
      "Core Hub",
    );
    expect(screen.getByTestId("active-loan-row-0")).toHaveTextContent(
      "Babylon Hub",
    );
  });

  it("flags a loan on an unregistered hub with the unknown-hub warning", () => {
    render(
      <ActiveLoansList
        rows={[
          makeRow({
            hub: {
              source: "address",
              address: "0x1111111111111111111111111111111111111111",
              label: "0x1111...1111",
            },
          }),
        ]}
        canBorrow
        onBorrow={vi.fn()}
        onRepay={vi.fn()}
      />,
    );

    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.hub.unknownHubWarning),
    ).toBeInTheDocument();
  });
});
