import type { Meta, StoryObj } from "@storybook/react";
import { SeizureMap } from "./SeizureMap";
import { bands, priceAxis, shareAxisLabels } from "./fixtures";

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
    bandClickHint: "click to open card",
    onBandClick: (key: string) => alert(`open card: Liq Event ${key}`),
  },
};
export default meta;

type Story = StoryObj<typeof SeizureMap>;

/** Hover a band to see the metrics popover; click to fire onBandClick. */
export const Full: Story = {};

export const Compact: Story = {
  args: { variant: "compact" },
};

/** Simulated price dropped through Event 1 — it reads as liquidated. */
export const PartiallyLiquidated: Story = {
  args: {
    currentPrice: 60000,
    currentPriceLabel: "$60,000",
    bands: bands.map((b) => (b.key === "1" ? { ...b, state: "liquidated" } : b)),
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
