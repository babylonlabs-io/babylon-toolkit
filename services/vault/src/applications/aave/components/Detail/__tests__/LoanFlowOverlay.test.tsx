/**
 * LoanFlowOverlay — step selection inside the single dialog. Two dialogs
 * handing off would cross-fade two opaque panels and show the page through the
 * gap, so these lock in that exactly one shell renders per step, and that the
 * borrow pickers (Select asset, Select hub) hand off by URL.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { LOAN_TAB } from "../../../constants";
import { LoanFlowOverlay } from "../index";

const SHELL_TESTID = "modal-shell";

/** Vault Devnet USDC, listed on both hubs (reserves 0 and 4). */
const USDC = "0xB588C1bd8A6cd3F114A52a0AD916778B419ECf48" as Address;
/** Vault Devnet USDG, listed on the Core Hub only (reserve 7). */
const USDG = "0x18d2048734d66cDB6468A93A3311feC9af037Cc4" as Address;

const useAaveBorrowedAssetsMock = vi.fn(() => ({
  borrowedAssets: [] as {
    reserveId: string;
    symbol: string;
  }[],
}));
const useAaveUserPositionMock = vi.hoisted(() =>
  vi.fn(() => ({
    position: undefined as
      | { collaterals: []; vaultIds: []; indexerError?: Error }
      | undefined,
    debtValueUsd: 0,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  })),
);

vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({
    open,
    onClose,
    onBack,
    children,
  }: {
    open: boolean;
    onClose?: () => void;
    onBack?: () => void;
    children: ReactNode;
  }) =>
    open ? (
      <div data-testid={SHELL_TESTID}>
        {onBack ? (
          <button onClick={onBack}>back</button>
        ) : (
          onClose && <button onClick={onClose}>close</button>
        )}
        {children}
      </div>
    ) : null,
}));

vi.mock("../../AssetSelectionPanel", () => ({
  AssetSelectionPanel: ({
    onSelectAsset,
  }: {
    onSelectAsset: (underlying: Address) => void;
  }) => (
    <div data-testid="picker-borrow">
      <button onClick={() => onSelectAsset(USDC)}>usdc</button>
      <button onClick={() => onSelectAsset(USDG)}>usdg</button>
    </div>
  ),
}));

vi.mock("../../HubSelectionPanel", () => ({
  HubSelectionPanel: ({
    underlying,
    onSelectReserve,
  }: {
    underlying: Address;
    onSelectReserve: (reserveId: bigint) => void;
  }) => (
    <div data-testid="hub-picker" data-underlying={underlying}>
      <button onClick={() => onSelectReserve(4n)}>core hub</button>
    </div>
  ),
}));

vi.mock("../../RepaySelectionPanel", () => ({
  RepaySelectionPanel: ({
    assets,
    onSelectReserve,
  }: {
    assets: { reserveId: string; symbol: string }[];
    onSelectReserve: (reserveId: bigint) => void;
  }) => (
    <div data-testid="picker-repay">
      {assets.map((asset) => (
        <button
          key={asset.reserveId}
          onClick={() => onSelectReserve(BigInt(asset.reserveId))}
        >
          {asset.symbol}
        </button>
      ))}
    </div>
  ),
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

const walletState = vi.hoisted(() => ({ isConnected: true }));

vi.mock("@/context/wallet", () => ({
  useConnection: () => walletState,
  useETHWallet: () => ({ address: "0xabc" }),
}));

vi.mock("../../../context", () => {
  const reserve = (reserveId: bigint, underlying: string) => ({
    reserveId,
    reserve: { underlying },
  });
  const borrowableReserves = [
    reserve(0n, "0xB588C1bd8A6cd3F114A52a0AD916778B419ECf48"),
    reserve(4n, "0xB588C1bd8A6cd3F114A52a0AD916778B419ECf48"),
    reserve(7n, "0x18d2048734d66cDB6468A93A3311feC9af037Cc4"),
  ];
  return {
    useAaveConfig: () => ({
      borrowableReserves,
      allBorrowReserves: borrowableReserves,
    }),
  };
});

vi.mock("../../../hooks", () => ({
  useAaveUserPosition: useAaveUserPositionMock,
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
  beforeEach(() => {
    walletState.isConnected = true;
    useAaveUserPositionMock.mockClear();
  });

  it("omits the position query address while disconnected", () => {
    walletState.isConnected = false;
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.REPAY}
        reserveId={null}
        tab={LOAN_TAB.REPAY}
        asset={null}
      />,
    );

    expect(useAaveUserPositionMock).toHaveBeenCalledWith(undefined);
    expect(screen.getByTestId("picker-repay")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  it("queries the position for the connected Ethereum address", () => {
    walletState.isConnected = true;
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.REPAY}
        reserveId={null}
        tab={LOAN_TAB.REPAY}
        asset={null}
      />,
    );

    expect(useAaveUserPositionMock).toHaveBeenCalledWith("0xabc");
    expect(screen.getByTestId("picker-repay")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

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
        asset={null}
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
      borrowedAssets: [{ reserveId: "2", symbol: "USDC" }],
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
        asset={null}
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
        asset={null}
      />,
    );

    expect(screen.getByTestId("picker-borrow")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(SHELL_TESTID)).toHaveLength(1);
  });

  it("opens Select hub for a token listed on two hubs", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId={null}
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "usdc" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/loans?picker=borrow&asset=${USDC}`,
    );
  });

  it("skips Select hub and opens the form for a token listed on one hub", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId={null}
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "usdg" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/loans?reserve=7&tab=borrow&asset=${USDG}`,
    );
  });

  it("shows Select hub for the token in the asset param", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId={null}
        tab={LOAN_TAB.BORROW}
        asset={USDC}
      />,
    );

    expect(screen.getByTestId("hub-picker")).toHaveAttribute(
      "data-underlying",
      USDC,
    );
    expect(screen.queryByTestId("picker-borrow")).not.toBeInTheDocument();
  });

  it("carries the chosen token onto the form when a hub is selected", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId={null}
        tab={LOAN_TAB.BORROW}
        asset={USDC}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "core hub" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/loans?reserve=4&tab=borrow&asset=${USDC}`,
    );
  });

  it("shows the form step in place of the picker once a reserve is selected", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={LOAN_TAB.BORROW}
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
    );

    expect(screen.getByTestId("form")).toHaveAttribute("data-reserve-id", "2");
    expect(screen.queryByTestId("picker-borrow")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(SHELL_TESTID)).toHaveLength(1);
  });

  it("goes back to Select hub from the form of a token on two hubs", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="4"
        tab={LOAN_TAB.BORROW}
        asset={USDC}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/loans?picker=borrow&asset=${USDC}`,
    );
  });

  it("goes back from a form whose reserve id has a leading zero", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="04"
        tab={LOAN_TAB.BORROW}
        asset={USDC}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/loans?picker=borrow&asset=${USDC}`,
    );
  });

  it("goes back to Select asset from the form of a token on one hub", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="7"
        tab={LOAN_TAB.BORROW}
        asset={USDG}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/loans?picker=borrow",
    );
    expect(screen.getByTestId("location")).not.toHaveTextContent("asset=");
  });

  it("shows close, not back, on a form opened without the pickers", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="4"
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
    );

    expect(screen.getByText("close")).toBeInTheDocument();
    expect(screen.queryByText("back")).not.toBeInTheDocument();
  });

  it("offers no back when the asset param doesn't match the open reserve", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="4"
        tab={LOAN_TAB.BORROW}
        asset={USDG}
      />,
    );

    expect(screen.queryByText("back")).not.toBeInTheDocument();
  });

  it("offers no back on the repay form", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="4"
        tab={LOAN_TAB.REPAY}
        asset={USDC}
      />,
    );

    expect(screen.queryByText("back")).not.toBeInTheDocument();
  });

  it("shows the success step once the transaction settles on that reserve", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
    );

    fireEvent.click(screen.getByTestId("form"));

    expect(screen.getByTestId("success")).toBeInTheDocument();
  });

  it("drops a settled success when the step navigates back to the picker", () => {
    const { rerender } = renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
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
          asset={null}
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
        asset={null}
      />,
      "/loans?reserve=2&tab=borrow",
    );

    fireEvent.click(screen.getByText("close"));

    expect(screen.getByTestId("location")).toHaveTextContent("/loans");
    expect(screen.getByTestId("location")).not.toHaveTextContent("reserve=");
  });

  it("locks every dismiss path while a transaction is in flight", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
    );

    fireEvent.click(screen.getByTestId("sign"));

    expect(screen.queryByText("close")).not.toBeInTheDocument();
  });

  it("withholds back while a transaction is in flight", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="4"
        tab={LOAN_TAB.BORROW}
        asset={USDC}
      />,
    );

    fireEvent.click(screen.getByTestId("sign"));

    expect(screen.queryByText("back")).not.toBeInTheDocument();
    expect(screen.queryByText("close")).not.toBeInTheDocument();
  });

  it("restores the close control on the success step after a tx settles", () => {
    renderOverlay(
      <LoanFlowOverlay
        picker={null}
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        asset={null}
      />,
    );

    // The form reports processing, then settles in the same interaction the
    // real Borrow/Repay forms do — its unmount must not strand the lock on.
    fireEvent.click(screen.getByTestId("sign"));
    fireEvent.click(screen.getByTestId("form"));

    expect(screen.getByTestId("success")).toBeInTheDocument();
    expect(screen.getByText("close")).toBeInTheDocument();
  });
});
