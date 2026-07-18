import type { Meta, StoryObj } from "@storybook/react";
import { Timeline } from "./Timeline";
import { bands, timelinePriceAxis, timeAxisLabels, makeCandles, safeZone } from "./fixtures";

const meta: Meta<typeof Timeline> = {
  title: "Components/Data Display/Charts/Timeline",
  component: Timeline,
  parameters: { layout: "padded" },
  argTypes: {
    seriesStyle: {
      control: { type: "inline-radio" },
      options: ["candles", "line", "area"],
      description: "Price-series render mode",
    },
    grid: {
      control: { type: "inline-radio" },
      options: ["dotted", "line", "dashed", "none"],
      mapping: {
        dotted: { lines: "both", style: "dotted" },
        line: { lines: "both", style: "solid" },
        dashed: { lines: "both", style: "dashed" },
        none: { lines: "none" },
      },
      description: "Background grid style",
    },
  },
  args: {
    bands,
    candles: makeCandles(),
    priceAxis: timelinePriceAxis,
    timeAxisLabels,
    safeZone,
    currentPrice: 88700,
    currentPriceLabel: "$88,700",
    variant: "full",
    bandClickHint: "click to open card",
    onBandClick: (key: string) => alert(`open card: Liq Event ${key}`),
  },
};
export default meta;

type Story = StoryObj<typeof Timeline>;

export const Full: Story = {};

/** Hover the candle area for a crosshair + OHLC readout. */
export const Crosshair: Story = {
  args: { interactions: { crosshair: true } },
};

/** Drag the candle area left/right to pan back through history. */
export const Pannable: Story = {
  args: {
    candles: makeCandles(160),
    visibleCandles: 44,
    interactions: { crosshair: true, pan: true },
  },
};

export const Compact: Story = {
  args: { variant: "compact" },
};

/** Horizontal-only solid gridlines; also try lines:"none" in controls. */
export const GridHorizontalSolid: Story = {
  args: { grid: { lines: "horizontal", style: "solid" } },
};

export const GridNone: Story = {
  args: { grid: { lines: "none" } },
};

export const LineSeries: Story = {
  args: { seriesStyle: "line" },
};

export const AreaSeries: Story = {
  args: { seriesStyle: "area" },
};

/** Wheel or +/− to zoom, drag to pan, double-click or ⟲ for the default view. */
export const Zoomable: Story = {
  args: {
    candles: makeCandles(160),
    visibleCandles: 44,
    interactions: { crosshair: true, pan: true, zoom: true },
  },
};

/** Candles take the full width when the seizure-map gutter is unplugged. */
export const NoGutter: Story = {
  args: { bandGutter: false },
};

/** All band text hidden — hover a band to identify it via the popover. */
export const HiddenLabels: Story = {
  args: { hideBandLabels: true },
};

/**
 * Bands anchor at their true price. To show events living below the default
 * floor, the app extends the price axis — here down to $0.
 */
export const ManyEvents: Story = {
  args: {
    priceAxis: [
      { value: 90000, label: "$90,000" },
      { value: 75000, label: "$75,000" },
      { value: 60000, label: "$60,000" },
      { value: 45000, label: "$45,000" },
      { value: 30000, label: "$30,000" },
      { value: 15000, label: "$15,000" },
      { value: 0, label: "$0" },
    ],
    bands: [
      ...bands,
      {
        key: "4",
        label: "Liq Event 4",
        sublabel: "(contain vault 4)",
        amountLabel: "0.05 BTC",
        priceTop: 3417,
        priceBottom: 2100,
        shareStart: 0,
        shareEnd: 0,
        state: "live",
        tone: "1",
      },
      {
        key: "5",
        label: "Liq Event 5",
        sublabel: "(contain vault 5)",
        amountLabel: "0.02 BTC",
        priceTop: 2100,
        priceBottom: 0,
        shareStart: 0,
        shareEnd: 0,
        state: "live",
        tone: "2",
      },
    ],
  },
};

/** No price-history feed yet: frame + band gutter render without candles. */
export const NoCandles: Story = {
  args: { candles: [] },
};

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};
