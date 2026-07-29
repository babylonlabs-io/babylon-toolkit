import type { Meta, StoryObj } from "@storybook/react";
import { SeizureMap } from "./SeizureMap";
import {
  bands,
  compressedBands,
  compressedShareTicks,
  dropoutLadderAxis,
  dropoutLadderBands,
  longLabelBands,
  priceAxis,
  shareAxisLabels,
  shareAxisTicks,
} from "./fixtures";

const meta: Meta<typeof SeizureMap> = {
  title: "Components/Data Display/Charts/SeizureMap",
  component: SeizureMap,
  parameters: { layout: "padded" },
  argTypes: {
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
    showPriceLineLabel: { control: "boolean" },
    priceLineColor: { control: "color" },
    priceLineLabelColor: { control: "color" },
  },
  args: {
    bands,
    priceAxis,
    shareAxisLabels,
    currentPrice: 88400,
    currentPriceLabel: "$88,400",
    variant: "full",
  },
};
export default meta;

type Story = StoryObj<typeof SeizureMap>;

export const Full: Story = {};

export const Compact: Story = {
  args: { variant: "compact" },
};

/**
 * The vault v3 overview configuration: no legend strip, positioned share
 * ticks, "Bitcoin Price" caption.
 */
export const VaultConfiguration: Story = {
  args: {
    shareAxisLabels: undefined,
    shareAxisTicks,
    showShareLegend: false,
    priceLineCaption: "Bitcoin Price",
  },
};

/** Simulated price dropped through Event 1 — it reads as liquidated. */
export const PartiallyLiquidated: Story = {
  args: {
    currentPrice: 60000,
    currentPriceLabel: "$60,000",
    bands: bands.map((b) => (b.key === "1" ? { ...b, state: "liquidated" } : b)),
  },
};

/** Every event underwater — the whole cascade reads as liquidated. */
export const AllLiquidated: Story = {
  args: {
    currentPrice: 3400,
    currentPriceLabel: "$3,400",
    bands: bands.map((b) => ({ ...b, state: "liquidated" })),
  },
};

/**
 * A visually-compressed share axis: the tiny final event is drawn wider than
 * its true share, and the positioned ticks carry the real percentages.
 */
export const CompressedShareAxis: Story = {
  args: {
    bands: compressedBands,
    shareAxisLabels: undefined,
    shareAxisTicks: compressedShareTicks,
  },
};

/** Legend strip off; the share axis stays. */
export const NoShareLegend: Story = {
  args: { showShareLegend: false },
};

/** All band text hidden — for dense or preview surfaces. */
export const HiddenLabels: Story = {
  args: { hideBandLabels: true },
};

export const GridDotted: Story = {
  args: { grid: { lines: "both", style: "dotted" } },
};

export const GridSolid: Story = {
  args: { grid: { lines: "both", style: "solid" } },
};

export const GridHorizontalOnly: Story = {
  args: { grid: { lines: "horizontal" } },
};

export const GridNone: Story = {
  args: { grid: { lines: "none" } },
};

/** Per-instance price-line colour override (line + inline label). */
export const PriceLineCustomColors: Story = {
  args: { priceLineColor: "#3b82f6", priceLineLabelColor: "#3b82f6" },
};

/** Bare price rule without the inline label. */
export const NoPriceLineLabel: Story = {
  args: { showPriceLineLabel: false },
};

/** Overlong band text truncates with an ellipsis instead of overflowing. */
export const LongLabels: Story = {
  args: { bands: longLabelBands },
};

/**
 * Bands shrink down a linear axis; text lines drop out with the height
 * (sublabel first, then amount, then the label itself).
 */
export const DropoutLadder: Story = {
  args: {
    bands: dropoutLadderBands,
    priceAxis: dropoutLadderAxis,
    currentPrice: 100000,
    currentPriceLabel: "$100,000",
    shareAxisLabels: ["0%", "20%", "40%", "60%", "80%", "100%"],
  },
};

/** Narrow container proves band text truncates instead of overflowing. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
};
