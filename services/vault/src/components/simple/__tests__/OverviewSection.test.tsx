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
      availableMeterPercent={0.75}
      borrowCapacityLoading={false}
      borrowCapacityError={null}
      borrowedMeterPercent={0.25}
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
    expect(screen.getByText("0.5 BTC")).toBeInTheDocument();

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

  it("exposes the available and borrowed meters as named progressbars, and shows the collateral BTC caption instead of a meter", () => {
    renderSection();

    expect(
      screen.getByRole("progressbar", {
        name: COPY.overview.availableToBorrowLabel,
      }),
    ).toHaveAttribute("aria-valuenow", "75");
    expect(
      screen.getByRole("progressbar", {
        name: COPY.overview.totalBorrowedLabel,
      }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(
      screen.getByText(COPY.overview.availableMeterLabel(75)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.overview.borrowedMeterLabel(25)),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("progressbar", {
        name: COPY.overview.totalCollateralValueLabel,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("0.5 BTC")).toBeInTheDocument();
  });

  it("labels sub-percent debt without rounding it to zero", () => {
    renderSection({
      availableMeterPercent: 0.9991,
      borrowedMeterPercent: 0.0009,
    });

    expect(screen.getByText(">99% remaining")).toBeInTheDocument();
    expect(screen.getByText("<1% borrowed")).toBeInTheDocument();
  });

  it("labels remaining sub-percent capacity without rounding it to zero", () => {
    renderSection({
      availableMeterPercent: 0.0009,
      borrowedMeterPercent: 0.9991,
    });

    expect(screen.getByText("<1% remaining")).toBeInTheDocument();
    expect(screen.getByText(">99% borrowed")).toBeInTheDocument();
  });

  it("shows a loading placeholder and hides both meters while borrow capacity loads", () => {
    renderSection({ borrowCapacityLoading: true });

    expect(screen.getByText(COPY.common.loading)).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", {
        name: COPY.overview.availableToBorrowLabel,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", {
        name: COPY.overview.totalBorrowedLabel,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("$2,000")).toBeInTheDocument();
  });

  it("shows an empty placeholder for available and hides both meters when borrow capacity errors", () => {
    renderSection({ borrowCapacityError: new Error("split params failed") });

    expect(screen.getByText(COPY.common.emptyValue)).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", {
        name: COPY.overview.availableToBorrowLabel,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", {
        name: COPY.overview.totalBorrowedLabel,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("$2,000")).toBeInTheDocument();
  });
});
