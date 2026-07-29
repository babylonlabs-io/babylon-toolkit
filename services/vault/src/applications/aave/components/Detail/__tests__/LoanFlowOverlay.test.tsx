/**
 * LoanFlowOverlay — step selection inside the single dialog. Two dialogs
 * handing off would cross-fade two opaque panels and show the page through the
 * gap, so these lock in that exactly one shell renders per step.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { LOAN_TAB } from "../../../constants";
import { LoanFlowOverlay } from "../index";

const SHELL_TESTID = "modal-shell";

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
    onSelectAsset: (reserveId: bigint) => void;
  }) => (
    <button data-testid={`picker-${mode}`} onClick={() => onSelectAsset(2n)}>
      picker
    </button>
  ),
  getAssetPickerWidthClass: () => "max-w-[700px]",
}));

vi.mock("../ReserveDetailPanel", () => ({
  ReserveDetailPanel: ({
    reserveId,
    onProcessingChange,
    onSuccess,
  }: {
    reserveId: string;
    onProcessingChange: (isProcessing: boolean) => void;
    onSuccess: (state: { reserveId: string; variant: string }) => void;
  }) => (
    <>
      <button data-testid="sign" onClick={() => onProcessingChange(true)}>
        sign
      </button>
      <button
        data-testid="form"
        data-reserve-id={reserveId}
        onClick={() => onSuccess({ reserveId, variant: "borrow" })}
      >
        settle
      </button>
    </>
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
  useAaveUserPosition: () => ({
    position: undefined,
    debtValueUsd: 0,
    isLoading: false,
  }),
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
      "/loans?reserve=2&tab=borrow",
    );
  });

  it("shows the form step in place of the picker once a reserve is selected", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId="2"
        tab={LOAN_TAB.BORROW}
      />,
    );

    expect(screen.getByTestId("form")).toHaveAttribute("data-reserve-id", "2");
    expect(screen.queryByTestId("picker-borrow")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(SHELL_TESTID)).toHaveLength(1);
  });

  it("shows the success step once the transaction settles on that reserve", () => {
    renderOverlay(
      <LoanFlowOverlay picker={null} reserveId="2" tab={LOAN_TAB.BORROW} />,
    );

    fireEvent.click(screen.getByTestId("form"));

    expect(screen.getByTestId("success")).toBeInTheDocument();
  });

  it("drops a settled success when the step navigates back to the picker", () => {
    const { rerender } = renderOverlay(
      <LoanFlowOverlay picker={null} reserveId="2" tab={LOAN_TAB.BORROW} />,
    );

    fireEvent.click(screen.getByTestId("form"));
    expect(screen.getByTestId("success")).toBeInTheDocument();

    // Browser Back to the picker: the overlay stays mounted, so the settled
    // success must not survive the step change.
    rerender(
      <MemoryRouter initialEntries={["/loans"]}>
        <LoanFlowOverlay
          picker={LOAN_TAB.BORROW}
          reserveId={null}
          tab={LOAN_TAB.BORROW}
        />
        <LocationDisplay />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("success")).not.toBeInTheDocument();
    expect(screen.getByTestId("picker-borrow")).toBeInTheDocument();
  });

  it("closes back to the base route, dropping the flow's query params", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId="2"
        tab={LOAN_TAB.BORROW}
      />,
      "/loans?reserve=2&tab=borrow",
    );

    fireEvent.click(screen.getByText("close"));

    expect(screen.getByTestId("location")).toHaveTextContent("/loans");
    expect(screen.getByTestId("location")).not.toHaveTextContent("reserve=");
  });

  it("locks every dismiss path while a transaction is in flight", () => {
    renderOverlay(
      <LoanFlowOverlay picker={null} reserveId="2" tab={LOAN_TAB.BORROW} />,
    );

    fireEvent.click(screen.getByTestId("sign"));

    expect(screen.queryByText("close")).not.toBeInTheDocument();
  });

  it("restores the close control on the success step after a tx settles", () => {
    renderOverlay(
      <LoanFlowOverlay picker={null} reserveId="2" tab={LOAN_TAB.BORROW} />,
    );

    // The form reports processing, then settles in the same interaction the
    // real Borrow/Repay forms do — its unmount must not strand the lock on.
    fireEvent.click(screen.getByTestId("sign"));
    fireEvent.click(screen.getByTestId("form"));

    expect(screen.getByTestId("success")).toBeInTheDocument();
    expect(screen.getByText("close")).toBeInTheDocument();
  });
});
