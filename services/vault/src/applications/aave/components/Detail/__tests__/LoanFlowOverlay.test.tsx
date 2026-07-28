/**
 * LoanFlowOverlay — step selection and the back navigation between steps.
 *
 * The point of this component is that picker, form and success are steps of ONE
 * dialog: two dialogs handing off would cross-fade two opaque `bg-surface`
 * panels and show the page through the gap. These tests lock in that exactly
 * one shell renders, and that selecting an asset advances the step inside it
 * rather than opening a second dialog.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { LOAN_TAB } from "../../../constants";
import { LoanFlowOverlay } from "../index";

const SHELL_TESTID = "modal-shell";

// v3 puts the flow's base route at /loans; the steps below assert against it.
vi.mock("@/config", () => ({ FeatureFlags: { isV3UiEnabled: true } }));

vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({
    open,
    onClose,
    children,
  }: {
    open: boolean;
    onClose?: () => void;
    children: ReactNode;
  }) =>
    open ? (
      <div data-testid={SHELL_TESTID}>
        {onClose && <button onClick={onClose}>close</button>}
        {children}
      </div>
    ) : null,
}));

vi.mock("../../AssetSelectionPanel", () => ({
  AssetSelectionPanel: ({
    mode,
    onSelectAsset,
  }: {
    mode: string;
    onSelectAsset: (symbol: string) => void;
  }) => (
    <button
      data-testid={`picker-${mode}`}
      onClick={() => onSelectAsset("WBTC")}
    >
      picker
    </button>
  ),
  getAssetPickerWidthClass: () => "max-w-[700px]",
}));

vi.mock("../ReserveDetailPanel", () => ({
  ReserveDetailPanel: ({ reserveId }: { reserveId: string }) => (
    <div data-testid="form" data-reserve-id={reserveId} />
  ),
}));

vi.mock("../../LoanCard/LoanSuccessPanel", () => ({
  LoanSuccessPanel: () => <div data-testid="success" />,
  LOAN_SUCCESS_WIDTH_CLASS: "max-w-[564px]",
}));

vi.mock("@/context/wallet", () => ({
  useConnection: () => ({ isConnected: true }),
  useETHWallet: () => ({ address: "0xabc" }),
}));

vi.mock("../../../hooks", () => ({
  useAaveUserPosition: () => ({ position: undefined, debtValueUsd: 0 }),
  useAaveBorrowedAssets: () => ({ borrowedAssets: [] }),
}));

function LocationDisplay() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

function renderOverlay(ui: ReactNode, path = "/loans") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {ui}
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("LoanFlowOverlay", () => {
  it("shows the picker step and no form when only the picker param is set", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId={null}
        tab={LOAN_TAB.BORROW}
      />,
    );

    expect(screen.getByTestId("picker-borrow")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
    // One dialog, always — the leak this component exists to prevent.
    expect(screen.getAllByTestId(SHELL_TESTID)).toHaveLength(1);
  });

  it("advances to the form in the same dialog when an asset is selected", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId={null}
        tab={LOAN_TAB.BORROW}
      />,
    );

    fireEvent.click(screen.getByTestId("picker-borrow"));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/loans?reserve=wbtc&tab=borrow",
    );
  });

  it("shows the form step in place of the picker once a reserve is selected", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId="wbtc"
        tab={LOAN_TAB.BORROW}
      />,
    );

    expect(screen.getByTestId("form")).toHaveAttribute(
      "data-reserve-id",
      "wbtc",
    );
    expect(screen.queryByTestId("picker-borrow")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(SHELL_TESTID)).toHaveLength(1);
  });

  it("closes back to the base route, dropping the flow's query params", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId="wbtc"
        tab={LOAN_TAB.BORROW}
      />,
      "/loans?reserve=wbtc&tab=borrow",
    );

    fireEvent.click(screen.getByText("close"));

    expect(screen.getByTestId("location")).toHaveTextContent("/loans");
    expect(screen.getByTestId("location")).not.toHaveTextContent("reserve=");
  });
});
