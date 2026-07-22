// Story fixtures only, not exported from the package. Production values come
// from the vault's liquidation cascade + price-history feed.
import type { Candle, LiquidationBand, PriceAxisTick } from "./types";

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
