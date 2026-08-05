import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/Wallet", () => ({
  Connect: ({ text }: { text: string }) => <button>{text}</button>,
}));
vi.mock("../useLandingBorrowAprs", () => ({
  useLandingBorrowAprs: () => ({
    usdt: "3.7%",
    usdc: "3.5%",
    wbtc: undefined,
  }),
}));
vi.mock("@/applications/aave/hooks", () => ({
  useVaultSplitParams: () => ({ params: { CF: 0.78 } }),
}));
const priceMock = vi.hoisted(() => ({
  prices: { BTC: 93_000 } as Record<string, number>,
  metadata: { BTC: { isStale: false, fetchFailed: false } } as Record<
    string,
    { isStale: boolean; fetchFailed: boolean }
  >,
}));
vi.mock("@/hooks/usePrices", () => ({
  usePrices: () => priceMock,
}));

import { COPY } from "@/copy";
import type { CapSnapshot } from "@/services/deposit";

import { DisconnectedOverview } from "../DisconnectedOverview";

const COPY_OVERVIEW = COPY.overview.disconnected;

const CAP_SNAPSHOT = {
  hasTotalCap: true,
  totalBTC: 9_000_000_000n,
  totalCapBTC: 10_000_000_000n,
} as CapSnapshot;

function renderOverview(
  capSnapshot: CapSnapshot | null = CAP_SNAPSHOT,
  capError: Error | null = null,
) {
  return render(
    <DisconnectedOverview capSnapshot={capSnapshot} capError={capError} />,
  );
}

describe("DisconnectedOverview", () => {
  beforeEach(() => {
    priceMock.prices = { BTC: 93_000 };
    priceMock.metadata = { BTC: { isStale: false, fetchFailed: false } };
  });

  it("renders the TVL, deposit-cap and borrow-up-to chips ahead of the headline", () => {
    const { container } = renderOverview();

    const tvlChip = screen.getByText(COPY_OVERVIEW.stats.tvlLabel);
    const capChip = screen.getByText(COPY_OVERVIEW.stats.capLabel);
    const cfChip = screen.getByText(COPY_OVERVIEW.stats.maxCfLabel);
    const headline = screen.getByRole("heading", { level: 1 });

    // 90 BTC locked at $93k prices the protocol at $8.4M.
    expect(tvlChip.nextElementSibling).toHaveTextContent("$8.4M");
    expect(capChip.nextElementSibling).toHaveTextContent("90/100 BTC");
    expect(cfChip.nextElementSibling).toHaveTextContent("78%");
    expect(
      tvlChip.compareDocumentPosition(capChip) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Design puts the chip row above the headline, not in a stat box below it.
    expect(
      capChip.compareDocumentPosition(headline) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector(".grid-cols-3")).toBeNull();
  });

  it("colours only the dot of the first 'i' by masking its stem with a dotless glyph", () => {
    renderOverview();

    const headline = screen.getByRole("heading", { level: 1 });
    const accent = headline.querySelector(".text-secondary-main");
    const stemMask = accent?.querySelector("[aria-hidden='true']");

    expect(accent).not.toBeNull();
    expect(accent).toHaveTextContent("i");
    expect(stemMask).toHaveTextContent("ı");
    expect(stemMask).toHaveClass("text-accent-primary");
  });

  it("reads and copies as plain 'Bitcoin' despite the two-layer dot", () => {
    renderOverview();

    const headline = screen.getByRole("heading", { level: 1 });

    expect(headline).toHaveAccessibleName(
      "Borrow against native Bitcoin, trustlessly.",
    );
    expect(headline.querySelector("[aria-hidden='true']")).toHaveClass(
      "select-none",
    );
  });

  it("starts the heading outline at h1, since the entry screen has no page title", () => {
    renderOverview();

    // RootLayout only renders the page-title h1 once connected, so the hero is
    // this page's first heading and the rates heading follows it as h2.
    const levels = screen
      .getAllByRole("heading")
      .map((h) => Number(h.tagName.slice(1)));

    expect(levels).toEqual([1, 2]);
  });

  it("shows the borrow rates under their own heading with a per-asset suffix", () => {
    renderOverview();

    expect(screen.getByText(COPY_OVERVIEW.aprHeading)).toBeInTheDocument();
    expect(screen.getByText("3.7%").parentElement).toHaveTextContent(
      `3.7% ${COPY_OVERVIEW.aprSuffix}`,
    );
    // An unresolved APR shows the empty marker and drops the "p.a." suffix
    // rather than reading "— p.a.".
    expect(
      screen.getByText(COPY_OVERVIEW.aprLabels.wbtc).parentElement,
    ).toHaveTextContent(COPY.common.emptyValue);
    expect(
      screen.getByText(COPY_OVERVIEW.aprLabels.wbtc).parentElement,
    ).not.toHaveTextContent(COPY_OVERVIEW.aprSuffix);
  });

  it("orders the feature rows so the native/trustless card sits second", () => {
    renderOverview();

    const features = COPY_OVERVIEW.features;
    const titles = [
      features.competitiveRates.title,
      features.selfCustodial.title,
      features.fastAccess.title,
      features.partialLiquidation.title,
      features.trustless.title,
    ];
    const rendered = titles.map((title) => screen.getByText(title));

    for (let i = 1; i < rendered.length; i++) {
      expect(
        rendered[i - 1].compareDocumentPosition(rendered[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(2);
  });

  it("falls back to the empty marker when the cap and split params are absent", () => {
    renderOverview(null);

    expect(
      screen.getByText(COPY_OVERVIEW.stats.capLabel).nextElementSibling,
    ).toHaveTextContent(COPY.common.emptyValue);
  });

  it("suppresses both cap-derived chips when the usage read errored", () => {
    renderOverview(CAP_SNAPSHOT, new Error("usage read failed"));

    // The snapshot falls back to a 0n total on an errored usage read, so
    // trusting it would price the protocol at $0 and claim an empty cap.
    expect(
      screen.getByText(COPY_OVERVIEW.stats.tvlLabel).nextElementSibling,
    ).toHaveTextContent(COPY.common.emptyValue);
    expect(
      screen.getByText(COPY_OVERVIEW.stats.capLabel).nextElementSibling,
    ).toHaveTextContent(COPY.common.emptyValue);
  });

  it("suppresses TVL when a fresh oracle round answers zero", () => {
    priceMock.prices = { BTC: 0 };

    renderOverview();

    expect(
      screen.getByText(COPY_OVERVIEW.stats.tvlLabel).nextElementSibling,
    ).toHaveTextContent(COPY.common.emptyValue);
  });

  it("suppresses TVL rather than pricing the protocol off a stale oracle round", () => {
    priceMock.metadata = { BTC: { isStale: true, fetchFailed: false } };

    renderOverview();

    expect(
      screen.getByText(COPY_OVERVIEW.stats.tvlLabel).nextElementSibling,
    ).toHaveTextContent(COPY.common.emptyValue);
    expect(
      screen.getByText(COPY_OVERVIEW.stats.capLabel).nextElementSibling,
    ).toHaveTextContent("90/100 BTC");
  });
});
