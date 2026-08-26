/**
 * AssetPill — the in-form asset switcher.
 *
 * Guards that picking a row navigates by the reserve's on-chain id rather than
 * its indexer-supplied symbol, so two reserves sharing a symbol can't steer the
 * switch to the wrong one (audit F7).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOAN_TAB } from "../../../constants";
import type { AaveReserveConfig } from "../../../services/fetchConfig";
import { AssetPill } from "../AssetPill";

const navigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@babylonlabs-io/core-ui", () => ({
  Popover: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("@/config", () => ({
  FeatureFlags: {},
  // AssetListItem pulls in @/utils/formatting, which reads BTC network config
  // at module scope.
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC", displayUSD: false }),
}));

vi.mock("@/services/token/tokenService", () => ({
  getTokenByAddress: () => ({ icon: "icon.png" }),
  getCurrencyIconWithFallback: () => "icon.png",
}));

// Two reserves deliberately share the symbol "USDC"; only their ids differ.
// Only the fields AssetPill reads are populated.
const reserves = [
  {
    reserveId: 2n,
    reserve: { underlying: "0xUSDC" as Address },
    token: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0xUSDC" as Address,
      decimals: 6,
    },
  },
  {
    reserveId: 9n,
    reserve: { underlying: "0xIMPOSTOR" as Address },
    token: {
      symbol: "USDC",
      name: "USD Coin (impostor)",
      address: "0xIMPOSTOR" as Address,
      decimals: 18,
    },
  },
] as unknown as AaveReserveConfig[];

describe("AssetPill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates by the clicked row's reserve id, not its symbol", () => {
    render(
      <AssetPill
        symbol="USDC"
        icon="icon.png"
        selectedReserveId={2n}
        reserves={reserves}
        mode={LOAN_TAB.BORROW}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /USDC/ }));
    fireEvent.click(screen.getByText("USD Coin (impostor)"));

    expect(navigate).toHaveBeenCalledWith("/loans?reserve=9&tab=borrow");
  });

  it("keeps the current tab when switching asset", () => {
    render(
      <AssetPill
        symbol="USDC"
        icon="icon.png"
        selectedReserveId={2n}
        reserves={reserves}
        mode={LOAN_TAB.REPAY}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /USDC/ }));
    fireEvent.click(screen.getByText("USD Coin"));

    expect(navigate).toHaveBeenCalledWith("/loans?reserve=2&tab=repay");
  });
});
