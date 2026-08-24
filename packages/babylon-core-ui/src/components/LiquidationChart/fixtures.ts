// Story fixtures only, not exported from the package. Production values come
// from the vault's liquidation cascade + price-history feed.
import type { Candle, LiquidationBand, PriceAxisTick, SafeZone } from "./types";

export const bands: LiquidationBand[] = [
  {
    key: "1",
    label: "Liq Event 1",
    sublabel: "(contain vault 1)",
    amountLabel: "0.6 BTC",
    priceTop: 77682,
    priceBottom: 40283,
    shareStart: 0,
    shareEnd: 0.55,
    state: "live",
    tone: "1",
    popoverMetrics: [
      { label: "At price", value: "$53,682", emphasis: true },
      { label: "Distance", value: "-13.0%" },
      { label: "Vaults", value: "Vault 1" },
      { label: "Seizes", value: "0.60 BTC" },
    ],
    cumulativeLabel: "55% seized",
  },
  {
    key: "2",
    label: "Liq Event 2",
    sublabel: "(contain vault 2)",
    amountLabel: "0.4 BTC",
    priceTop: 40283,
    priceBottom: 3597,
    shareStart: 0.55,
    shareEnd: 0.91,
    state: "live",
    tone: "2",
    popoverMetrics: [
      { label: "At price", value: "$40,283", emphasis: true },
      { label: "Distance", value: "-34.7%" },
      { label: "Vaults", value: "Vault 2" },
      { label: "Seizes", value: "0.40 BTC" },
    ],
    cumulativeLabel: "91% seized",
  },
  {
    key: "3",
    label: "Liq Event 3",
    sublabel: "(contain vault 3)",
    amountLabel: "0.1 BTC",
    priceTop: 3597,
    priceBottom: 3417,
    shareStart: 0.91,
    shareEnd: 1,
    state: "live",
    tone: "3",
    popoverMetrics: [
      { label: "At price", value: "$3,597", emphasis: true },
      { label: "Distance", value: "-94.2%" },
      { label: "Vaults", value: "Vault 3" },
      { label: "Seizes", value: "0.10 BTC" },
    ],
    cumulativeLabel: "100% seized",
  },
];

export const priceAxis: PriceAxisTick[] = [
  { value: 88400, label: "$88,400" },
  { value: 77682, label: "$77,682" },
  { value: 40283, label: "$40,283" },
  { value: 3597, label: "$3,597" },
  { value: 3417, label: "$3,417" },
];

export const shareAxisLabels = ["0%", "55%", "91%", "100%"];

/** Timeline price axis: round ticks above the first trigger, then the axis
 * floor (mirrors the vault's `buildTimelinePriceAxis`, which only spaces
 * ticks down to the first trigger — everything below it already carries its
 * own dashed level line + price pill). The floor tick still anchors the
 * scale's domain but carries no label of its own, matching the design's two
 * visible axis labels. */
export const timelinePriceAxis: PriceAxisTick[] = [
  { value: 100000, label: "$100,000" },
  { value: 80000, label: "$80,000" },
  { value: 3417, label: "" },
];

export const timeAxisLabels = ["May 5", "12", "19", "Jun", "8", "15", "22"];

/**
 * Time-axis label for a candle: the day of the month, naming the month
 * instead on the first days of one, so a multi-month window still says where
 * it is. Mirrors the vault's `formatCandleDate` (the source of truth for this
 * formatting — core-ui never formats dates itself), currently at
 * `services/vault/src/components/pages/Liquidations/liquidationChartData.ts` —
 * keep the two in sync.
 */
const MONTH_LABEL_MAX_DAY = 7;

export function formatCandleDate(timeMs: number): string {
  const date = new Date(timeMs);
  return date.getUTCDate() <= MONTH_LABEL_MAX_DAY
    ? date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
    : String(date.getUTCDate());
}

/** Deterministic random walk so the story is stable across reloads. */
export function makeCandles(count = 60): Candle[] {
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out: Candle[] = [];
  let price = 82000;
  const start = Date.UTC(2026, 4, 5);
  const day = 86400000;
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rand() - 0.46) * 3200;
    const close = Math.max(58000, Math.min(89000, open + drift));
    const high = Math.max(open, close) + rand() * 1400;
    const low = Math.min(open, close) - rand() * 1400;
    out.push({ time: start + i * day, open, high, low, close });
    price = close;
  }
  return out;
}

export const safeZone = {
  title: "Safe zone",
  lines: ["no events above $59,050", "4.3% drop to Liq 1"],
};

/**
 * Compressed share axis: event 3 is really 1% of collateral but drawn 20%
 * wide so it stays readable; `compressedShareTicks` carries the true
 * percentages at the compressed band edges (mirrors the vault's projection).
 */
export const compressedBands: LiquidationBand[] = [
  { ...bands[0], shareStart: 0, shareEnd: 0.45 },
  { ...bands[1], shareStart: 0.45, shareEnd: 0.8 },
  { ...bands[2], amountLabel: "0.01 BTC", shareStart: 0.8, shareEnd: 1 },
];

export const compressedShareTicks = [
  { fraction: 0, label: "0%" },
  { fraction: 0.45, label: "55%" },
  { fraction: 0.8, label: "99%" },
  { fraction: 1, label: "100%" },
];

/** True-percentage ticks matching the uncompressed `bands` share widths. */
export const shareAxisTicks = [
  { fraction: 0, label: "0%" },
  { fraction: 0.55, label: "55%" },
  { fraction: 0.91, label: "91%" },
  { fraction: 1, label: "100%" },
];

/** Overlong text in every band slot, to prove measured truncation. */
export const longLabelBands: LiquidationBand[] = bands.map((band, i) => ({
  ...band,
  label: `Liquidation Event ${i + 1} with a very long name`,
  sublabel: `(contains vaults ${i + 1}, ${i + 4}, ${i + 7} and several more)`,
  amountLabel: `${band.amountLabel} across multiple vaults`,
}));

/**
 * Progressively shorter bands down a linear axis. Text lines drop out as a
 * band shrinks: sublabel below ~76px, amount below ~54px, label below ~26px.
 */
export const dropoutLadderAxis: PriceAxisTick[] = [
  { value: 100000, label: "$100,000" },
  { value: 0, label: "$0" },
];

export const dropoutLadderBands: LiquidationBand[] = (() => {
  // Band price spans shrink toward the bottom of a 0..100k linear axis.
  const spans = [30000, 21000, 13000, 8000, 5000];
  const out: LiquidationBand[] = [];
  let top = 98000;
  for (let i = 0; i < spans.length; i++) {
    out.push({
      key: `ladder-${i + 1}`,
      label: `Liq Event ${i + 1}`,
      sublabel: `(contain vault ${i + 1})`,
      amountLabel: `0.${5 - i} BTC`,
      priceTop: top,
      priceBottom: top - spans[i],
      shareStart: i * 0.2,
      shareEnd: (i + 1) * 0.2,
      state: "live",
      tone: `${(i % 3) + 1}` as LiquidationBand["tone"],
    });
    top -= spans[i];
  }
  return out;
})();

/**
 * Liquidation levels within a few dollars of each other: their axis pills
 * would overlap, so the declutter pass pushes the labels apart while the
 * dashed level lines stay at the true prices.
 */
export const collidingLevelBands: LiquidationBand[] = [
  { ...bands[0], key: "c1", priceTop: 62000, priceBottom: 55000 },
  { ...bands[1], key: "c2", priceTop: 61400, priceBottom: 48000 },
  { ...bands[2], key: "c3", priceTop: 60900, priceBottom: 42000 },
];

/**
 * A full 10-vault cascade — the protocol's maximum position size (up to 10
 * vaults per position). Exercises the gutter's degrade-past-floor path: 10
 * fixed-height event rows would blow past the plot on their own, so
 * `timelineRegionFractions` compresses every row evenly once they do, instead
 * of clipping rows or crushing the safe zone. See the `ManyEvents` story.
 */
export const manyEventBands: LiquidationBand[] = (() => {
  const triggers = [82000, 75000, 68000, 61000, 54000, 47000, 40000, 33000, 26000, 19000];
  const amounts = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05];
  const floor = 15000;
  return triggers.map((priceTop, i) => ({
    key: `many-${i + 1}`,
    label: `Liq Event ${i + 1}`,
    sublabel: `(contain vault ${i + 1})`,
    amountLabel: `${amounts[i]} BTC`,
    priceTop,
    priceBottom: triggers[i + 1] ?? floor,
    shareStart: i / triggers.length,
    shareEnd: (i + 1) / triggers.length,
    state: "live",
    tone: `${(i % 3) + 1}` as LiquidationBand["tone"],
  }));
})();

/** Sparse, like `timelinePriceAxis`: two visible labels, an unlabelled floor
 * anchoring the domain below the lowest trigger (19,000). */
export const manyEventPriceAxis: PriceAxisTick[] = [
  { value: 100000, label: "$100,000" },
  { value: 90000, label: "$90,000" },
  { value: 15000, label: "" },
];

/* ---- Simulator-story derivations (mirror the vault's projection) ----- */

export function formatUsd(price: number): string {
  return `$${Math.round(price).toLocaleString("en-US")}`;
}

/** Bands with `state` derived from the simulated price. */
export function simulateBandStates(base: LiquidationBand[], btcPrice: number): LiquidationBand[] {
  return base.map((b) => ({ ...b, state: btcPrice <= b.priceTop ? "liquidated" : "live" }));
}

/** Safe-zone callout derived from the simulated price and the first trigger. */
export function simulatedSafeZone(base: LiquidationBand[], btcPrice: number): SafeZone {
  const firstTrigger = base[0]?.priceTop ?? 0;
  const dropPct = btcPrice > firstTrigger ? ((btcPrice - firstTrigger) / btcPrice) * 100 : 0;
  return {
    title: "Safe zone",
    lines: [`no events above ${formatUsd(firstTrigger)}`, `${dropPct.toFixed(1)}% drop to Liq 1`],
  };
}
