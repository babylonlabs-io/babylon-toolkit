import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { OverviewSection } from "../OverviewSection";

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => "signet",
}));

const onDeposit = vi.fn();
const onBorrow = vi.fn();
const onRepay = vi.fn();

function renderSection(overrides: Record<string, unknown> = {}) {
  return render(
    <OverviewSection
      totalCollateralValue="$10,000"
      totalBorrowed="$2,000"
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
    expect(screen.getByText("$2,000")).toBeInTheDocument();
    expect(screen.getByText(COPY.overview.positionTitle)).toBeInTheDocument();
    // Collateral USD and its BTC amount share one line: the BTC amount is a
    // nested secondary span inside the value, not a separate caption row.
    const collateralBtc = screen.getByText("0.5 BTC");
    expect(collateralBtc.parentElement).toHaveTextContent("$10,000 0.5 BTC");

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
    expect(screen.getByText("$2,000")).toBeInTheDocument();
  });

  it("shows an empty placeholder for available when borrow capacity errors", () => {
    renderSection({ borrowCapacityError: new Error("split params failed") });

    expect(screen.getByText(COPY.common.emptyValue)).toBeInTheDocument();
    expect(screen.getByText("$2,000")).toBeInTheDocument();
  });
});
