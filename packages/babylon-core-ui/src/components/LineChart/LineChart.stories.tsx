import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { LineChart } from "./LineChart";
import type { ChartAxisTick, LineChartPoint } from "./types";

/**
 * An interest-rate model curve: flat-ish up to the kink, steep after it. The
 * chart knows none of that — it receives points and pre-formatted strings.
 */
function rateCurve(kink: number, baseApr: number, slopeBefore: number, slopeAfter: number): LineChartPoint[] {
  return Array.from({ length: 101 }, (_, utilisation) => ({
    x: utilisation,
    y:
      utilisation <= kink
        ? baseApr + (slopeBefore * utilisation) / kink
        : baseApr + slopeBefore + (slopeAfter * (utilisation - kink)) / (100 - kink),
  }));
}

const DAY_MS = 86_400_000;
const HISTORY_START_MS = 1_752_000_000_000;

/** A rate history that drifts inside a narrow band well clear of zero. */
function rateHistory(days: number): LineChartPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    x: HISTORY_START_MS + i * DAY_MS,
    y: 3.9 + Math.sin(i / 4) * 0.55 + Math.sin(i / 11) * 0.35,
  }));
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatUtilisation = (value: number) => `${Math.round(value)}%`;
const formatDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const utilisationTicks: ChartAxisTick[] = [0, 25, 50, 75, 100].map((value) => ({
  value,
  label: formatUtilisation(value),
}));
const aprTicks: ChartAxisTick[] = [0, 6, 12, 18, 24].map((value) => ({ value, label: formatPercent(value) }));

const meta: Meta<typeof LineChart> = {
  title: "Components/Data Display/Charts/LineChart",
  component: LineChart,
  parameters: { layout: "padded" },
  argTypes: {
    interpolation: {
      control: { type: "inline-radio" },
      options: ["linear", "step"],
      description: "How consecutive points join",
    },
    grid: {
      control: { type: "inline-radio" },
      options: ["dashed", "dotted", "solid", "horizontal", "none"],
      mapping: {
        dashed: { lines: "both", style: "dashed" },
        dotted: { lines: "both", style: "dotted" },
        solid: { lines: "both", style: "solid" },
        horizontal: { lines: "horizontal" },
        none: { lines: "none" },
      },
      description: "Background grid",
    },
  },
  args: {
    data: rateCurve(80, 1.5, 2.5, 18),
    xDomain: [0, 100],
    yDomain: [0, 24],
    xTicks: utilisationTicks,
    yTicks: aprTicks,
    ariaLabel: "Borrow rate against utilisation",
  },
};
export default meta;

type Story = StoryObj<typeof LineChart>;

export const Default: Story = {};

/**
 * The **C2 shape**: a continuous curve over an explicit 0–100% x domain with an
 * explicit y domain, plus two annotated markers — a solid "current" and a
 * dashed kink. Their rules are two percentage points apart, so the callouts
 * would overlap; the current callout takes the other side of its rule.
 *
 * Collisions resolve in array order, so the marker listed **first** keeps its
 * preferred side. Here the kink is listed first and the current marker gives
 * ground, matching the design reference.
 */
export const AnnotatedMarkersColliding: Story = {
  args: {
    markers: [
      {
        key: "kink",
        x: 80,
        title: "Optimal (Kink) 80%",
        lines: ["APR ~ 4.0%"],
        style: "dashed",
        color: "#e77b3c",
      },
      {
        key: "current",
        x: 78,
        title: "Current 78%",
        lines: ["APR ~ 3.9%"],
        color: "#e77b3c",
      },
    ],
  },
};

/** The same two markers far enough apart that both keep their preferred side. */
export const AnnotatedMarkersClear: Story = {
  args: {
    markers: [
      {
        key: "kink",
        x: 80,
        title: "Optimal (Kink) 80%",
        lines: ["APR ~ 4.0%"],
        style: "dashed",
        color: "#e77b3c",
      },
      {
        key: "current",
        x: 42,
        title: "Current 42%",
        lines: ["APR ~ 2.8%"],
        color: "#e77b3c",
      },
    ],
  },
};

/** Every marker crowded into one corner: the callouts run out of both sides and
 * stack rather than escape the plot. */
export const AnnotatedMarkersCrowded: Story = {
  args: {
    markers: [
      { key: "a", x: 88, title: "Marker A", lines: ["value 1"] },
      { key: "b", x: 91, title: "Marker B", lines: ["value 2"], style: "dashed" },
      { key: "c", x: 94, title: "Marker C", lines: ["value 3"] },
    ],
  },
};

/** Hover anywhere along the curve — the readout interpolates between points. */
export const HoverAnywhere: Story = {
  args: {
    renderTooltip: (hover) => (
      <>
        <span>{formatUtilisation(hover.x)} utilisation</span>
        <strong>{formatPercent(hover.y)} APR</strong>
      </>
    ),
  },
};

interface HistoryArgs {
  days: number;
}

/**
 * The **C3 shape**: a stepped line over a time axis with a *fitted* y domain —
 * the rate never approaches zero, so the axis fills with the band it actually
 * occupies. Hover snaps to the datum and the tooltip names its date and value.
 * The timeframe selector belongs to the host, which re-feeds `data` on change.
 */
export const RateHistory: StoryObj<HistoryArgs> = {
  args: { days: 30 },
  argTypes: { days: { control: { type: "inline-radio" }, options: [7, 30, 90] } },
  parameters: { controls: { include: ["days"] } },
  render: ({ days }) => <RateHistoryStory days={days} />,
};

function RateHistoryStory({ days }: HistoryArgs) {
  const [timeframe, setTimeframe] = useState(days);
  const data = useMemo(() => rateHistory(timeframe), [timeframe]);

  const timeTicks = useMemo(
    () =>
      Array.from({ length: Math.min(6, data.length) }, (_, i) => {
        const point = data[Math.round((i / 5) * (data.length - 1))];
        return { value: point.x, label: formatDay(point.x) };
      }),
    [data],
  );

  // A fitted axis is the app's to label: it derives ticks from the same values
  // it feeds the chart.
  const rateTicks = useMemo(() => {
    const values = data.map((p) => p.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return Array.from({ length: 4 }, (_, i) => {
      const value = min + ((max - min) * i) / 3;
      return { value, label: formatPercent(value) };
    });
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {[7, 30, 90].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTimeframe(option)}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: "999px",
              border: "1px solid var(--bbn-chart-surface-stroke)",
              background: option === timeframe ? "var(--bbn-chart-surface-stroke)" : "transparent",
              color: "var(--bbn-chart-surface-text)",
              cursor: "pointer",
            }}
          >
            {option}D
          </button>
        ))}
      </div>
      <LineChart
        data={data}
        interpolation="step"
        hoverMode="nearest"
        xTicks={timeTicks}
        yTicks={rateTicks}
        ariaLabel="Borrow APR over time"
        renderTooltip={(hover) => (
          <>
            <span>{formatDay(hover.point.x)}</span>
            <strong>{formatPercent(hover.point.y)}</strong>
          </>
        )}
      />
    </div>
  );
}

/** A stepped series against a linear one over the same points. */
export const Stepped: Story = {
  args: { interpolation: "step" },
};

/**
 * Without `yDomain` the axis fits the data. The same series looks flat against
 * an explicit zero-based domain and legible against a fitted one.
 */
export const FittedYDomain: Story = {
  args: {
    data: rateHistory(30),
    interpolation: "step",
    xDomain: undefined,
    yDomain: undefined,
    xTicks: undefined,
    yTicks: [3.2, 3.8, 4.4, 5.0].map((value) => ({ value, label: formatPercent(value) })),
    ariaLabel: "Borrow APR over time",
  },
};

/** Opt into the entry reveal; the app supplies the `--motion-*` values. */
export const Animated: Story = {
  args: {
    animate: true,
    markers: [{ key: "kink", x: 80, title: "Optimal (Kink) 80%", lines: ["APR ~ 4.0%"], style: "dashed" }],
  },
};

export const GridNone: Story = {
  args: { grid: { lines: "none" } },
};

export const CustomColor: Story = {
  args: { color: "#355e78" },
};

/** A taller plot for surfaces that are not wide. */
export const SquarerAspect: Story = {
  args: { aspectRatio: 4 / 3 },
};

export const Narrow: Story = {
  args: {
    markers: [
      { key: "kink", x: 80, title: "Optimal (Kink) 80%", lines: ["APR ~ 4.0%"], style: "dashed" },
      { key: "current", x: 78, title: "Current 78%", lines: ["APR ~ 3.9%"] },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};

/** A single point still renders a coherent frame. */
export const SinglePoint: Story = {
  args: {
    data: [{ x: 50, y: 12 }],
    xTicks: undefined,
    yTicks: undefined,
  },
};
