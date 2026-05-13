/**
 * Activity page wallet-gating tests.
 *
 * The Header treats the user as connected only when BOTH the BTC and ETH
 * wallets are connected (see RootLayout.tsx). These tests lock in that the
 * Activity page uses the same canonical signal: a stale ETH address alone
 * must not trigger an indexer query or the "connected" empty state.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useConnectionMock = vi.fn();
const useETHWalletMock = vi.fn();
const useActivitiesWithPendingMock = vi.fn();

vi.mock("../../../context/wallet", () => ({
  useConnection: () => useConnectionMock(),
  useETHWallet: () => useETHWalletMock(),
}));

vi.mock("../../../hooks/useActivitiesWithPending", () => ({
  useActivitiesWithPending: (arg: unknown) => useActivitiesWithPendingMock(arg),
}));

import Activity from "../Activity";

function renderActivity() {
  return render(
    <MemoryRouter initialEntries={["/activity"]}>
      <Routes>
        <Route element={<Outlet context={{ openDeposit: () => {} }} />}>
          <Route path="/activity" element={<Activity />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Activity page — wallet gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActivitiesWithPendingMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it("treats BTC-disconnected + ETH-stale-address as disconnected, skipping the indexer query", () => {
    useConnectionMock.mockReturnValue({
      isConnected: false,
      btcConnected: false,
      ethConnected: true,
    });
    useETHWalletMock.mockReturnValue({
      address: "0xabc0000000000000000000000000000000000001",
      connected: true,
    });

    renderActivity();

    expect(
      screen.getByText("Connect your wallet to view your activity"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No activity yet. Make your first deposit to get started.",
      ),
    ).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(undefined);
  });

  it("treats ETH-disconnected + BTC-connected as disconnected, skipping the indexer query", () => {
    useConnectionMock.mockReturnValue({
      isConnected: false,
      btcConnected: true,
      ethConnected: false,
    });
    useETHWalletMock.mockReturnValue({
      address: undefined,
      connected: false,
    });

    renderActivity();

    expect(
      screen.getByText("Connect your wallet to view your activity"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No activity yet. Make your first deposit to get started.",
      ),
    ).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(undefined);
  });

  it("treats both wallets connected as connected and renders the connected empty state", () => {
    useConnectionMock.mockReturnValue({
      isConnected: true,
      btcConnected: true,
      ethConnected: true,
    });
    useETHWalletMock.mockReturnValue({
      address: "0xabc0000000000000000000000000000000000001",
      connected: true,
    });

    renderActivity();

    expect(
      screen.getByText(
        "No activity yet. Make your first deposit to get started.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Connect your wallet to view your activity"),
    ).not.toBeInTheDocument();

    expect(useActivitiesWithPendingMock).toHaveBeenCalledWith(
      "0xabc0000000000000000000000000000000000001",
    );
  });
});
