/**
 * LoanFlowOverlay — step selection inside the single dialog. Two dialogs
 * handing off would cross-fade two opaque panels and show the page through the
 * gap, so these lock in that exactly one shell renders per step.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { LOAN_TAB } from "../../../constants";
import { LoanFlowOverlay } from "../index";

const SHELL_TESTID = "modal-shell";
const useAaveBorrowedAssetsMock = vi.fn(() => ({
  borrowedAssets: [] as {
    reserveId: string;
    symbol: string;
    name: string;
    icon: string;
  }[],
}));
const useAaveUserPositionMock = vi.fn(() => ({
  position: undefined as
    | { collaterals: []; vaultIds: []; indexerError?: Error }
    | undefined,
  debtValueUsd: 0,
  isLoading: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

// `getNetworkConfigBTC` is read at module scope by the token registry, which
// this tree reaches through `@/routes`.
vi.mock("@/config", () => ({
  FeatureFlags: {},
  getNetworkConfigBTC: () => ({ icon: "btc-icon.svg", coinSymbol: "vBTC" }),
}));

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
    assets,
    onSelectAsset,
  }: {
    mode: string;
    assets?: { reserveId: bigint; symbol: string }[];
    onSelectAsset: (reserveId: bigint) => void;
  }) => (
    <div data-testid={`picker-${mode}`}>
      {assets ? (
        assets.map((asset) => (
          <button
            key={String(asset.reserveId)}
            onClick={() => onSelectAsset(asset.reserveId)}
          >
            {asset.symbol}
          </button>
        ))
      ) : (
        <button onClick={() => onSelectAsset(2n)}>picker</button>
      )}
    </div>
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
  useAaveUserPosition: () => useAaveUserPositionMock(),
  useAaveBorrowedAssets: () => useAaveBorrowedAssetsMock(),
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
  it("shows an error and retry instead of an empty Repay picker after an RPC failure", async () => {
    const refetch = vi.fn().mockRejectedValue(new Error("RPC unavailable"));
    useAaveUserPositionMock.mockReturnValueOnce({
      position: undefined,
      debtValueUsd: 0,
      isLoading: false,
      error: new Error("RPC unavailable"),
      refetch,
    });
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.REPAY}
        reserveId={null}
        tab={LOAN_TAB.REPAY}
      />,
    );
    expect(
      screen.getByText(COPY.loans.detail.positionLoadError),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("picker-repay")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.loans.detail.retry }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: COPY.loans.detail.retry }),
      ).toBeEnabled(),
    );
    expect(refetch).toHaveBeenCalledOnce();
    expect(
      screen.getByText(COPY.loans.detail.positionLoadError),
    ).toBeInTheDocument();
  });

  it("keeps the Repay picker open after a background position read fails", () => {
    useAaveBorrowedAssetsMock.mockReturnValueOnce({
      borrowedAssets: [
        { reserveId: "2", symbol: "USDC", name: "USD Coin", icon: "" },
      ],
    });
    useAaveUserPositionMock.mockReturnValueOnce({
      position: { collaterals: [], vaultIds: [] },
      debtValueUsd: 1500,
      isLoading: false,
      error: new Error("RPC unavailable"),
      refetch: vi.fn(),
    });
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.REPAY}
        reserveId={null}
        tab={LOAN_TAB.REPAY}
      />,
    );
    expect(
      screen.queryByText(COPY.loans.detail.positionLoadError),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.detail.ancillaryLoadWarning),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "USDC" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/loans?reserve=2&tab=repay",
    );
  });

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

    fireEvent.click(screen.getByRole("button", { name: "picker" }));

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
