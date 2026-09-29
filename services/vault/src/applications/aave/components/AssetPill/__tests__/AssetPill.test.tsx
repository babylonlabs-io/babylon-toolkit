/**
 * AssetPill — the in-form asset switcher.
 *
 * Guards that picking a row navigates by the reserve's on-chain id rather than
 * its indexer-supplied symbol, so two reserves sharing a symbol can't steer the
 * switch to the wrong one (audit F7), and that each entry names its hub.
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
  useLocation: () => ({ pathname: "/loans" }),
}));

vi.mock("@babylonlabs-io/core-ui", () => ({
  Popover: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
  Hint: () => null,
}));

vi.mock("@/services/token/tokenService", () => ({
  // No registry hit, so every row carries the indexer label the test sets.
  getRegisteredTokenByAddress: () => null,
  getCurrencyIconWithFallback: () => "icon.png",
}));

const BABYLON_HUB = "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as Address;
const CORE_HUB = "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca" as Address;

function reserve(
  reserveId: bigint,
  underlying: string,
  hub: Address,
  name: string,
): AaveReserveConfig {
  return {
    reserveId,
    reserve: { underlying, hub },
    token: { symbol: "USDC", name, address: underlying, decimals: 6 },
  } as unknown as AaveReserveConfig;
}

// Three reserves deliberately share the symbol "USDC": one token on two hubs,
// and an impostor token on another address. Only their ids differ reliably.
const reserves = [
  reserve(2n, "0xUSDC", BABYLON_HUB, "USD Coin"),
  reserve(4n, "0xUSDC", CORE_HUB, "USD Coin"),
  reserve(9n, "0xIMPOSTOR", BABYLON_HUB, "USD Coin (impostor)"),
];

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

    expect(navigate).toHaveBeenCalledWith(
      { pathname: "/loans", search: "?reserve=9&tab=borrow" },
      { replace: true },
    );
  });

  it("names each entry's hub so one token's reserves are told apart", () => {
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
    fireEvent.click(screen.getByText("USDC on Core Hub"));

    expect(navigate).toHaveBeenCalledWith(
      { pathname: "/loans", search: "?reserve=4&tab=borrow" },
      { replace: true },
    );
  });

  it("keeps the current tab when switching asset", () => {
    render(
      <AssetPill
        symbol="USDC"
        icon="icon.png"
        selectedReserveId={9n}
        reserves={reserves}
        mode={LOAN_TAB.REPAY}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /USDC/ }));
    fireEvent.click(screen.getAllByText("USD Coin")[0]);

    expect(navigate).toHaveBeenCalledWith(
      { pathname: "/loans", search: "?reserve=2&tab=repay" },
      { replace: true },
    );
  });
});
