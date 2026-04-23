import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CapSnapshot } from "@/services/deposit";

import { SupplyCapSection } from "../SupplyCapSection";

const mockBtcPrice = vi.fn(() => 69_003.07);
vi.mock("@/hooks/usePrices", () => ({
  usePrice: (symbol: string) => (symbol === "BTC" ? mockBtcPrice() : 0),
}));

const BTC_1000 = 100_000_000_000n;
const BTC_10 = 1_000_000_000n;
// 0.62225053 BTC (sub-1 value with 8 significant fractional digits)
const BTC_FRACTIONAL = 62_225_053n;
// 10.12345678 BTC (>= 1 value with a noisy fraction that should be truncated)
const BTC_10_NOISY = 1_012_345_678n;

const cappedSnapshot: CapSnapshot = {
  totalCapBTC: BTC_1000,
  perAddressCapBTC: 0n,
  totalBTC: BTC_10,
  userBTC: null,
  hasTotalCap: true,
  hasPerAddressCap: false,
  remainingTotal: BTC_1000 - BTC_10,
  remainingForUser: null,
  effectiveRemaining: BTC_1000 - BTC_10,
};

const fractionalSnapshot: CapSnapshot = {
  totalCapBTC: BTC_10_NOISY,
  perAddressCapBTC: 0n,
  totalBTC: BTC_FRACTIONAL,
  userBTC: null,
  hasTotalCap: true,
  hasPerAddressCap: false,
  remainingTotal: BTC_10_NOISY - BTC_FRACTIONAL,
  remainingForUser: null,
  effectiveRemaining: BTC_10_NOISY - BTC_FRACTIONAL,
};

const unlimitedSnapshot: CapSnapshot = {
  totalCapBTC: 0n,
  perAddressCapBTC: 0n,
  totalBTC: BTC_10,
  userBTC: null,
  hasTotalCap: false,
  hasPerAddressCap: false,
  remainingTotal: null,
  remainingForUser: null,
  effectiveRemaining: null,
};

describe("SupplyCapSection", () => {
  it("renders the Protocol Cap header and both cards", () => {
    mockBtcPrice.mockReturnValue(69_003.07);
    render(<SupplyCapSection snapshot={cappedSnapshot} />);
    expect(screen.getByText("Protocol Cap")).toBeInTheDocument();
    expect(screen.getByText("Total Cap")).toBeInTheDocument();
    expect(screen.getByText("Total Deposited")).toBeInTheDocument();
  });

  it("formats BTC values with comma-grouped whole parts", () => {
    mockBtcPrice.mockReturnValue(69_003.07);
    render(<SupplyCapSection snapshot={cappedSnapshot} />);
    // Coin symbol is network-dependent ("BTC" on mainnet, "sBTC" on signet).
    expect(screen.getByText(/1,000 s?BTC/)).toBeInTheDocument();
    expect(screen.getByText(/10 s?BTC/)).toBeInTheDocument();
  });

  it("shows USD equivalents in parentheses when BTC price is available", () => {
    mockBtcPrice.mockReturnValue(69_003.07);
    render(<SupplyCapSection snapshot={cappedSnapshot} />);
    // 1,000 * 69,003.07 = 69,003,070.00
    expect(screen.getByText(/\$69,003,070\.00/)).toBeInTheDocument();
    // 10 * 69,003.07 = 690,030.70
    expect(screen.getByText(/\$690,030\.70/)).toBeInTheDocument();
  });

  it("omits USD parentheses when BTC price is zero (still loading)", () => {
    mockBtcPrice.mockReturnValue(0);
    render(<SupplyCapSection snapshot={cappedSnapshot} />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("renders nothing when the cap is unlimited (hasTotalCap = false)", () => {
    mockBtcPrice.mockReturnValue(69_003.07);
    const { container } = render(
      <SupplyCapSection snapshot={unlimitedSnapshot} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when snapshot is null", () => {
    const { container } = render(<SupplyCapSection snapshot={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("truncates values >= 1 BTC to 2 decimals and keeps < 1 BTC values at up to 8 decimals", () => {
    mockBtcPrice.mockReturnValue(69_003.07);
    render(<SupplyCapSection snapshot={fractionalSnapshot} />);
    // 10.12345678 BTC >= 1 → 2 decimals → "10.12"
    expect(screen.getByText(/10\.12 s?BTC/)).toBeInTheDocument();
    // 0.62225053 BTC < 1 → 8 decimals preserved
    expect(screen.getByText(/0\.62225053 s?BTC/)).toBeInTheDocument();
  });

  it("renders skeleton placeholders while loading with no snapshot yet", () => {
    mockBtcPrice.mockReturnValue(0);
    const { container } = render(
      <SupplyCapSection snapshot={null} isLoading />,
    );
    expect(screen.getByText("Protocol Cap")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);
  });

  it("renders real data (not skeleton) once the snapshot arrives even if isLoading is still true", () => {
    mockBtcPrice.mockReturnValue(69_003.07);
    const { container } = render(
      <SupplyCapSection snapshot={cappedSnapshot} isLoading />,
    );
    expect(screen.getByText("Total Cap")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});
