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

/** Linear price axis for the Timeline (candles need a true price scale). */
export const timelinePriceAxis: PriceAxisTick[] = [
  { value: 90000, label: "$90,000" },
  { value: 80000, label: "$80,000" },
  { value: 70000, label: "$70,000" },
  { value: 60000, label: "$60,000" },
  { value: 50000, label: "$50,000" },
  { value: 40000, label: "$40,000" },
];

export const timeAxisLabels = ["May 5", "12", "19", "Jun", "8", "15", "22"];

/** Deterministic random walk so the story is stable across reloads. */
export function makeCandles(count = 44): Candle[] {
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

/* ---- Simulator-story derivations (mirror the vault's projection) ----- */

export function formatUsd(price: number): string {
  return `$${Math.round(price).toLocaleString("en-US")}`;
}

/** Bands with `state` derived from the simulated price. */
export function simulateBandStates(base: LiquidationBand[], btcPrice: number): LiquidationBand[] {
  return base.map((b) => ({ ...b, state: btcPrice <= b.priceTop ? "liquidated" : "live" }));
}

/**
 * Segmented axis re-derived around the simulated price: the price itself,
 * every trigger, and the cascade floor, sorted descending and deduped —
 * the same rule the vault uses, so the axis re-flows as the price moves.
 */
export function simulatedPriceAxis(base: LiquidationBand[], btcPrice: number): PriceAxisTick[] {
  const floor = base[base.length - 1]?.priceBottom ?? 0;
  const values = Array.from(new Set([btcPrice, ...base.map((b) => b.priceTop), floor])).sort((a, b) => b - a);
  return values.map((value) => ({ value, label: formatUsd(value) }));
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
