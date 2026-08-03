import type { Meta, StoryObj } from "@storybook/react";
import { Timeline } from "./Timeline";
import {
  bands,
  collidingLevelBands,
  formatUsd,
  makeCandles,
  safeZone,
  simulateBandStates,
  simulatedSafeZone,
  timeAxisLabels,
  timelinePriceAxis,
} from "./fixtures";
import type { TimelineSeriesStyle } from "./types";

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
    liquidatedLabel: "Liquidated",
  },
};
export default meta;

type Story = StoryObj<typeof Timeline>;

export const Full: Story = {};

interface SimulatorArgs {
  btcPrice: number;
  candleCount: number;
  seriesStyle: TimelineSeriesStyle;
  crosshair: boolean;
  pan: boolean;
  zoom: boolean;
}

/**
 * Drag the BTC price and watch the derived state re-flow: the price pill,
 * which events read as liquidated, and the safe-zone callout — the same
 * projection rules the vault applies. Candle count feeds the pan/zoom window.
 */
export const Simulator: StoryObj<SimulatorArgs> = {
  args: {
    btcPrice: 88700,
    candleCount: 44,
    seriesStyle: "candles",
    crosshair: true,
    pan: false,
    zoom: false,
  },
  argTypes: {
    btcPrice: { control: { type: "range", min: 3000, max: 95000, step: 100 } },
    candleCount: { control: { type: "range", min: 1, max: 160, step: 1 } },
    seriesStyle: { control: "inline-radio", options: ["candles", "line", "area"] },
  },
  parameters: {
    controls: { include: ["btcPrice", "candleCount", "seriesStyle", "crosshair", "pan", "zoom"] },
  },
  render: (args) => (
    <Timeline
      bands={simulateBandStates(bands, args.btcPrice)}
      candles={makeCandles(args.candleCount)}
      priceAxis={timelinePriceAxis}
      safeZone={simulatedSafeZone(bands, args.btcPrice)}
      currentPrice={args.btcPrice}
      currentPriceLabel={formatUsd(args.btcPrice)}
      seriesStyle={args.seriesStyle}
      visibleCandles={44}
      interactions={{ crosshair: args.crosshair, pan: args.pan, zoom: args.zoom }}
      liquidatedLabel="Liquidated"
    />
  ),
};

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

/** All band text hidden — for dense or preview surfaces. */
export const HiddenLabels: Story = {
  args: { hideBandLabels: true },
};

/**
 * Five events share the gutter below the safe zone in equal blocks — every
 * event reads at the same size regardless of its price span, and the axis
 * pills keep the true trigger prices.
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

/** Gutter without the safe-zone callout. */
export const NoSafeZone: Story = {
  args: { safeZone: undefined },
};

/**
 * In a narrow container the fixed-third safe zone is too short for the detail
 * lines, so the callout keeps its title and sheds them.
 */
export const TightSafeZone: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 460 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Liquidation levels a few dollars apart: the axis pills would overlap, so the
 * declutter pass fans the labels out while each dashed line stays at its price.
 */
export const CollidingLevels: Story = {
  args: { bands: collidingLevelBands },
};

/** Degenerate two-tick price axis still renders a coherent frame. */
export const TwoTickAxis: Story = {
  args: {
    priceAxis: [
      { value: 90000, label: "$90,000" },
      { value: 40000, label: "$40,000" },
    ],
  },
};

/** Full-width line series with the gutter unplugged. */
export const NoGutterLineSeries: Story = {
  args: { bandGutter: false, seriesStyle: "line" },
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
