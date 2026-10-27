import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { OverviewSection } from "../OverviewSection";

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => "signet",
}));

const BORROWED_ASSETS = [
  {
    reserveId: "2",
    symbol: "USDC",
    name: "USD Coin",
    hub: {
      source: "registry" as const,
      address: "0x0000000000000000000000000000000000000001" as const,
      label: "Babylon Hub",
    },
    amount: "2,000",
    icon: "/images/usdc.svg",
  },
];

const onDeposit = vi.fn();
const onBorrow = vi.fn();
const onRepay = vi.fn();

function renderSection(overrides: Record<string, unknown> = {}) {
  return render(
    <OverviewSection
      totalCollateralValue="$10,000"
      borrowedAssets={BORROWED_ASSETS}
      borrowedValue="$2,000.00 USD"
      maxBorrowReserves={1}
      borrowCount={1n}
      availableToBorrow="$5,000"
      collateralBtc="0.5 BTC"
      borrowCapacityLoading={false}
      borrowCapacityError={null}
      onDeposit={onDeposit}
      isDepositDisabled={false}
      onBorrow={onBorrow}
      onRepay={onRepay}
      canBorrow={true}
      canRepay={true}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OverviewSection", () => {
  it("greys the Deposit action out while deposits are blocked", () => {
    renderSection({ isDepositDisabled: true });

    const deposit = screen.getByRole("button", {
      name: COPY.overview.depositAction,
    });
    expect(deposit).toBeDisabled();
    fireEvent.click(deposit);
    expect(onDeposit).not.toHaveBeenCalled();

    // The gate is deposit-scoped: borrow and repay keep their own conditions.
    expect(
      screen.getByRole("button", { name: COPY.overview.borrowAction }),
    ).toBeEnabled();
  });

  it("renders the three stat values and their action buttons", () => {
    renderSection();

    expect(screen.getByText("$10,000")).toBeInTheDocument();
    expect(screen.getByText("$5,000")).toBeInTheDocument();
    expect(screen.getByText("$2,000.00 USD")).toBeInTheDocument();
    expect(screen.getByText(COPY.overview.positionTitle)).toBeInTheDocument();
    const collateralUsd = screen.getByText("$10,000");
    const collateralBtc = screen.getByText("0.5 BTC");
    expect(collateralBtc).toHaveAttribute("title", "0.5 BTC");
    expect(collateralUsd.closest("[title]")).not.toContainElement(
      collateralBtc,
    );

    expect(
      screen.getByRole("button", { name: COPY.overview.depositAction }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.overview.borrowAction }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.overview.repayAction }),
    ).toBeInTheDocument();
  });

  it("titles the collateral value with the USD total", () => {
    renderSection();

    const collateralValue = screen.getByText("$10,000").closest("[title]");
    expect(collateralValue).toHaveAttribute("title", "$10,000");
  });

  it("fires the matching callback when each action is clicked", () => {
    renderSection();

    fireEvent.click(
      screen.getByRole("button", { name: COPY.overview.depositAction }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: COPY.overview.borrowAction }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: COPY.overview.repayAction }),
    );

    expect(onDeposit).toHaveBeenCalledTimes(1);
    expect(onDeposit).toHaveBeenCalledWith();
    expect(onBorrow).toHaveBeenCalledTimes(1);
    expect(onRepay).toHaveBeenCalledTimes(1);
  });

  it("disables Borrow and Repay when the position cannot act, Deposit stays enabled", () => {
    renderSection({ canBorrow: false, canRepay: false });

    expect(
      screen.getByRole("button", { name: COPY.overview.depositAction }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: COPY.overview.borrowAction }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: COPY.overview.repayAction }),
    ).toBeDisabled();
  });

  it("shows a loading placeholder for available borrow capacity while it loads", () => {
    renderSection({ borrowCapacityLoading: true });

    expect(screen.getByText(COPY.common.loading)).toBeInTheDocument();
    expect(screen.getByText("$2,000.00 USD")).toBeInTheDocument();
  });

  it("shows an empty placeholder for available when borrow capacity errors", () => {
    renderSection({ borrowCapacityError: new Error("split params failed") });

    expect(screen.getByText(COPY.common.emptyValue)).toBeInTheDocument();
    expect(screen.getByText("$2,000.00 USD")).toBeInTheDocument();
  });
});
