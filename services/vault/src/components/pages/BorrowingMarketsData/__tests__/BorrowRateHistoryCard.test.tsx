import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// core-ui's dist is built in this worktree, so the real LineChart renders;
// only Hint is swapped for a no-op (matches the sibling cards' convention),
// since the brief requires exercising the real chart output, not a mock.
vi.mock("@babylonlabs-io/core-ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@babylonlabs-io/core-ui")>();
  return { ...actual, Hint: () => null };
});

vi.mock("@/applications/aave/hooks", () => ({
  useBorrowRateHistory: vi.fn(),
}));

import { useBorrowRateHistory } from "@/applications/aave/hooks";
import { COPY } from "@/copy";

import { BorrowRateHistoryCard } from "../BorrowRateHistoryCard";

const mockedUseBorrowRateHistory = vi.mocked(useBorrowRateHistory);

function hitArea() {
  return screen.getByTestId("line-chart-hit");
}

describe("BorrowRateHistoryCard", () => {
  beforeEach(() => {
    mockedUseBorrowRateHistory.mockReset();
  });

  it("opens on the 1W range and queries the hook with it", () => {
    mockedUseBorrowRateHistory.mockReturnValue({
      points: [{ timeMs: 1_000, ratePercent: 3.5 }],
      isLoading: false,
      error: null,
    });

    render(<BorrowRateHistoryCard reserveId={5n} symbol="vBTC" />);

    expect(mockedUseBorrowRateHistory).toHaveBeenCalledWith({
      reserveId: 5n,
      range: "1w",
    });
    const activeButton = screen.getByTestId("history-range-1w");
    expect(activeButton.className).toContain("bg-background-contrast");
    // The selection is also exposed non-visually.
    expect(activeButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("history-range-1d")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("draws the history line in the theme's primary text color, not the series default", () => {
    mockedUseBorrowRateHistory.mockReturnValue({
      points: [{ timeMs: 1_000, ratePercent: 3.5 }],
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <BorrowRateHistoryCard reserveId={5n} symbol="vBTC" />,
    );

    const chartRoot = container.querySelector(".bbn-line-chart");
    expect(chartRoot?.className).toContain("text-accent-primary");

    const seriesPath = chartRoot?.querySelector(".bbn-line-chart__series");
    const seriesGroup = seriesPath?.closest("g");
    expect(seriesGroup?.getAttribute("style")).toContain(
      "--bbn-line-chart-series: currentColor",
    );
  });

  it("re-queries with 6m and recomputes the header range when 6M is clicked", () => {
    mockedUseBorrowRateHistory.mockImplementation(({ range }) =>
      range === "1w"
        ? {
            points: [{ timeMs: 1_000, ratePercent: 3.5 }],
            isLoading: false,
            error: null,
          }
        : {
            points: [
              { timeMs: 1_000, ratePercent: 2.0 },
              { timeMs: 2_000, ratePercent: 4.0 },
            ],
            isLoading: false,
            error: null,
          },
    );

    render(<BorrowRateHistoryCard reserveId={5n} symbol="vBTC" />);

    expect(screen.getByTestId("borrow-rate-history-figure")).toHaveTextContent(
      "3.5%",
    );

    fireEvent.click(screen.getByTestId("history-range-6m"));

    expect(mockedUseBorrowRateHistory).toHaveBeenLastCalledWith({
      reserveId: 5n,
      range: "6m",
    });
    expect(screen.getByTestId("borrow-rate-history-figure")).toHaveTextContent(
      "2% – 4%",
    );
    const active = screen.getByTestId("history-range-6m");
    expect(active.className).toContain("bg-background-contrast");
  });

  it("shows the loading copy while the hook is loading", () => {
    mockedUseBorrowRateHistory.mockReturnValue({
      points: null,
      isLoading: true,
      error: null,
    });

    render(<BorrowRateHistoryCard reserveId={5n} symbol="vBTC" />);

    expect(screen.getByText(COPY.common.loading)).toBeInTheDocument();
  });

  it("shows the unavailable copy on a hook error", () => {
    mockedUseBorrowRateHistory.mockReturnValue({
      points: null,
      isLoading: false,
      error: new Error("indexer down"),
    });

    render(<BorrowRateHistoryCard reserveId={5n} symbol="vBTC" />);

    expect(
      screen.getByText(COPY.marketData.charts.chartUnavailable),
    ).toBeInTheDocument();
  });

  it("shows the empty copy when the reserve has no history", () => {
    mockedUseBorrowRateHistory.mockReturnValue({
      points: [],
      isLoading: false,
      error: null,
    });

    render(<BorrowRateHistoryCard reserveId={5n} symbol="vBTC" />);

    expect(
      screen.getByText(COPY.marketData.charts.historyEmpty),
    ).toBeInTheDocument();
  });

  it("renders the hovered datum's date and rate — proving coordinate-driven selection, not an index-0 fallback", () => {
    mockedUseBorrowRateHistory.mockReturnValue({
      points: [
        { timeMs: new Date(2026, 6, 4, 14, 0).getTime(), ratePercent: 3.0 },
        { timeMs: new Date(2026, 6, 5, 14, 0).getTime(), ratePercent: 4.0 },
      ],
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <BorrowRateHistoryCard reserveId={5n} symbol="vBTC" />,
    );

    // jsdom reports an all-zero client rect for the hit area, so `clientX`
    // reads straight through as the plot-local x (see LineChart's own
    // tests). The fallback chart width is 1016px; this repo's test setup has
    // no canvas backend, so measureText returns 0 and the measured gutter
    // collapses to the fixed 24px label gap, leaving a 992px plot. 948 sits
    // well past its midpoint, selecting the SECOND datum in "nearest" mode.
    // A NaN-coordinate bug (no PointerEvent polyfill) would instead always
    // resolve to index 0, i.e. the first datum's date/rate, so asserting the
    // second proves real coordinates drove the selection.
    fireEvent.pointerMove(hitArea(), { clientX: 948 });

    const tooltip = container.querySelector(".bbn-line-chart__tooltip");
    expect(tooltip).toHaveTextContent("Jul 5, 2026");
    expect(tooltip).toHaveTextContent("4%");
    expect(tooltip?.textContent).not.toContain("Jul 4");
    expect(tooltip?.textContent).not.toContain("3%");
  });
});
