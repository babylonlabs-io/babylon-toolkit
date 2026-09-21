/**
 * HubSelectionPanel — Select hub lists one row per borrowable reserve of the
 * chosen token, names each hub, and routes by reserve id.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import type { AaveReserveConfig } from "../../../services/fetchConfig";
import { HubSelectionPanel } from "../HubSelectionPanel";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
  Hint: ({ tooltip }: { tooltip: ReactNode }) => <span>{tooltip}</span>,
}));

const config = vi.hoisted(() => ({
  config: { coreSpokeAddress: "0xspoke" },
  borrowableReserves: [] as unknown[],
}));

vi.mock("../../../context", () => ({
  useAaveConfig: () => config,
}));

const drawHeadroom = vi.hoisted(() => ({
  headroomByReserveId: {} as Record<string, number | null>,
}));
const liquidity = vi.hoisted(() => ({
  liquidityByReserveId: {} as Record<string, { availableLiquidity: number }>,
}));

vi.mock("../../../hooks", () => ({
  useAaveReservesPrices: () => ({ pricesByReserveId: { "0": 1, "4": 1 } }),
  useAaveBorrowAprs: () => ({ aprPercentByReserveId: { "0": 3.5, "4": 3.7 } }),
  useAaveReserveLiquidity: () => liquidity,
  useAaveReserveDrawHeadroom: () => drawHeadroom,
}));

const USDC = "0xB588C1bd8A6cd3F114A52a0AD916778B419ECf48" as Address;
const WBTC = "0x504579d0424B7B7cB4b17e16626f6A2f67bCa054" as Address;
const BABYLON_HUB = "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as Address;
const CORE_HUB = "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca" as Address;

function reserve(
  reserveId: bigint,
  underlying: Address,
  hub: Address,
): AaveReserveConfig {
  return {
    reserveId,
    reserve: { underlying, hub },
    token: { address: underlying, symbol: "TKN", name: "Token" },
  } as unknown as AaveReserveConfig;
}

function LocationDisplay() {
  const { pathname } = useLocation();
  return <div data-testid="location">{pathname}</div>;
}

function renderPanel(onSelectReserve = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/loans"]}>
      <HubSelectionPanel underlying={USDC} onSelectReserve={onSelectReserve} />
      <LocationDisplay />
    </MemoryRouter>,
  );
  return onSelectReserve;
}

describe("HubSelectionPanel", () => {
  beforeEach(() => {
    config.borrowableReserves = [
      reserve(0n, USDC, BABYLON_HUB),
      reserve(2n, WBTC, BABYLON_HUB),
      reserve(4n, USDC, CORE_HUB),
    ];
    drawHeadroom.headroomByReserveId = {};
    liquidity.liquidityByReserveId = {
      "0": { availableLiquidity: 35_500_000 },
      "4": { availableLiquidity: 15_800_000 },
    };
  });

  it("lists one row per borrowable reserve of the chosen token, naming each hub", () => {
    renderPanel();

    expect(screen.getByText("Select hub")).toBeInTheDocument();
    expect(screen.getByTestId("hub-option-0")).toHaveTextContent("Babylon Hub");
    expect(screen.getByTestId("hub-option-4")).toHaveTextContent("Core Hub");
    expect(screen.queryByTestId("hub-option-2")).not.toBeInTheDocument();
  });

  it("shows each hub's borrow APR and available liquidity in compact USD", () => {
    renderPanel();

    expect(screen.getByTestId("hub-option-0")).toHaveTextContent("3.5%");
    expect(screen.getByTestId("hub-option-0")).toHaveTextContent("$35.5M");
    expect(screen.getByTestId("hub-option-4")).toHaveTextContent("3.7%");
    expect(screen.getByTestId("hub-option-4")).toHaveTextContent("$15.8M");
  });

  it("shows the hub's borrow limit instead of its liquidity when the limit leaves less", () => {
    // Core Hub holds $15.8M, but our borrow limit there leaves $2M; Babylon
    // Hub's limit leaves more than its liquidity, so liquidity still binds.
    drawHeadroom.headroomByReserveId = { "0": 50_000_000, "4": 2_000_000 };

    renderPanel();

    expect(screen.getByTestId("hub-option-0")).toHaveTextContent("$35.5M");
    expect(screen.getByTestId("hub-option-4")).toHaveTextContent("$2M");
  });

  it("shows a used-up borrow limit as $0 even when the hub's liquidity did not load", () => {
    liquidity.liquidityByReserveId = {
      "0": { availableLiquidity: 35_500_000 },
    };
    drawHeadroom.headroomByReserveId = { "4": 0 };

    renderPanel();

    expect(screen.getByTestId("hub-option-4")).toHaveTextContent("$0");
  });

  it("routes by the clicked hub row's reserve id", () => {
    const onSelectReserve = renderPanel();

    fireEvent.click(screen.getByTestId("hub-option-4"));

    expect(onSelectReserve).toHaveBeenCalledWith(4n);
  });

  it("opens that reserve's market page from Market Info", () => {
    const onSelectReserve = renderPanel();

    fireEvent.click(screen.getByTestId("hub-market-info-4"));

    expect(screen.getByTestId("location")).toHaveTextContent("/markets/4");
    expect(onSelectReserve).not.toHaveBeenCalled();
  });

  it("names an unregistered hub by its short address with the unknown-hub warning", () => {
    config.borrowableReserves = [
      reserve(8n, USDC, "0x2222222222222222222222222222222222222222"),
    ];

    renderPanel();

    expect(screen.getByTestId("hub-option-8")).toHaveTextContent(
      "0x2222...2222",
    );
    expect(
      screen.getByText(COPY.loans.hub.unknownHubWarning),
    ).toBeInTheDocument();
  });

  it("shows the empty copy when the token has no borrowable reserve", () => {
    config.borrowableReserves = [reserve(2n, WBTC, BABYLON_HUB)];

    renderPanel();

    expect(screen.getByText(COPY.loans.hub.empty)).toBeInTheDocument();
  });
});
