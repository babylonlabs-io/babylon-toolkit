import type {
  LiquidationBand,
  LiquidationBandTone,
  PriceAxisTick,
} from "@babylonlabs-io/core-ui";

import type {
  CalculatorResult,
  LiquidationGroup,
} from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import { formatBtcAmount, formatPriceUsd, formatUsd } from "@/utils/formatting";

/**
 * Projects the liquidation cascade (`CalculatorResult.groups`) into the shapes
 * the core-ui charts + event cards consume. core-ui is a dumb renderer, so ALL
 * derivation and formatting happens here.
 *
 * Three values are derived (no new financial model — see issue #2043):
 *  - post-liquidation Health Factor: remaining collateral × price × CF ÷ debt.
 *    Uses the collateral factor, matching `calculate.ts`, NOT the SDK's
 *    liquidation-threshold HF.
 *  - fairness payment in wBTC: `fairnessPaymentUsd / btcPrice`.
 *  - Sacrificial vs Protected badge: no backing field exists. The first-seized
 *    group (index 0) is the sacrificial one; the rest are protected.
 *    // ponytail: index===0 heuristic — confirm the rule with design.
 */

const TONES: LiquidationBandTone[] = ["1", "2", "3"];

export interface LiquidationEventCard {
  key: string;
  title: string;
  badge: "sacrificial" | "protected";
  collateralLabel: string;
  liqPriceLabel: string;
  distanceLabel: string;
  distanceNegative: boolean;
  seizedVaults: { name: string; amountLabel: string }[];
  targetSeizureLabel: string;
  overSeizureLabel: string;
  collateralLiquidatedLabel: string;
  debtRepaidLabel: string;
  liquidatorProfitLabel: string;
  /** Full group shows a wBTC fairness payment; safe groups show fairness debt repaid. */
  fairness: { label: string; value: string };
  btcRemainingLabel: string;
  debtRemainingLabel: string;
  hfAfterLabel: string;
}

export interface LiquidationChartData {
  bands: LiquidationBand[];
  priceAxis: PriceAxisTick[];
  shareAxisTicks: { fraction: number; label: string }[];
  cards: LiquidationEventCard[];
}

export interface LiquidationChartOptions {
  /** Simulated (or live) BTC price driving which bands read as liquidated. */
  btcPrice: number;
  /** Collateral factor (0–1) from on-chain params, for post-liq HF. */
  collateralFactor: number;
}

/**
 * Headroom below the last trigger for the axis floor, so the final event reads
 * as a band rather than a hairline. The axis deliberately stops above $0.
 */
const AXIS_FLOOR_MARGIN = 0.05;

/** Bottom of the price axis: just under the last trigger, or 0 with no events. */
export function axisFloorPrice(result: CalculatorResult): number {
  const triggers = result.groups.map((g) => g.liquidationPrice);
  if (triggers.length === 0) return 0;
  return Math.min(...triggers) * (1 - AXIS_FLOOR_MARGIN);
}

/**
 * Exponent applied to each event's collateral share before it becomes a band
 * width. 1 renders true proportions, which makes a 1%-of-collateral event an
 * unreadable sliver; 0 renders every event equally wide, which hides that some
 * events seize far more than others. The square root keeps the ordering and a
 * visible size difference while lifting the smallest band into legibility.
 */
const SHARE_WIDTH_EXPONENT = 0.5;

/**
 * Band widths from collateral shares, compressed by {@link SHARE_WIDTH_EXPONENT}
 * and renormalised so they still fill the axis. Returns cumulative boundaries,
 * so `[0, …, 1]` with one entry per band edge.
 */
export function compressedShareBoundaries(shares: number[]): number[] {
  const weights = shares.map((share) =>
    Math.pow(Math.max(0, share), SHARE_WIDTH_EXPONENT),
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  const boundaries = [0];
  let cumulative = 0;
  for (const weight of weights) {
    cumulative += total > 0 ? weight / total : 0;
    boundaries.push(cumulative);
  }
  // Guard against float drift leaving the last edge just shy of the axis end.
  boundaries[boundaries.length - 1] = 1;
  return boundaries;
}

const toneFor = (index: number): LiquidationBandTone =>
  TONES[index % TONES.length];

function formatSignedPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function hfAfter(
  group: LiquidationGroup,
  btcPrice: number,
  cf: number,
): string {
  if (group.debtRemainingAfter <= 0) return "∞";
  return (
    (group.btcRemainingAfter * btcPrice * cf) /
    group.debtRemainingAfter
  ).toFixed(3);
}

function toCard(
  group: LiquidationGroup,
  btcPrice: number,
  cf: number,
): LiquidationEventCard {
  const sacrificial = group.index === 0;
  const fairness = group.isFullLiquidation
    ? {
        label: COPY.liquidations.events.fairnessPaymentWbtc,
        value: `${formatUsd(group.fairnessPaymentUsd)} (${formatBtcAmount(group.fairnessPaymentUsd / btcPrice)})`,
      }
    : {
        label: COPY.liquidations.events.fairnessDebtRepaid,
        value: formatUsd(group.fairnessDebtRepay),
      };

  return {
    key: String(group.index),
    title: COPY.liquidations.eventTitle(group.index + 1),
    badge: sacrificial ? "sacrificial" : "protected",
    collateralLabel: formatBtcAmount(group.combinedBtc),
    liqPriceLabel: formatPriceUsd(group.liquidationPrice),
    distanceLabel: formatSignedPct(group.distancePct),
    distanceNegative: group.distancePct < 0,
    seizedVaults: group.vaults.map((v) => ({
      name: v.name,
      amountLabel: formatBtcAmount(v.btc),
    })),
    targetSeizureLabel: formatBtcAmount(group.targetSeizureBtc),
    overSeizureLabel: `+${formatBtcAmount(group.overSeizureBtc)}`,
    collateralLiquidatedLabel: formatBtcAmount(group.combinedBtc),
    debtRepaidLabel: formatUsd(group.debtRepaid),
    liquidatorProfitLabel: formatUsd(group.liquidatorProfitUsd),
    fairness,
    btcRemainingLabel: formatBtcAmount(group.btcRemainingAfter),
    debtRemainingLabel: formatUsd(group.debtRemainingAfter),
    hfAfterLabel: hfAfter(group, btcPrice, cf),
  };
}

export function buildLiquidationChartData(
  result: CalculatorResult,
  { btcPrice, collateralFactor }: LiquidationChartOptions,
): LiquidationChartData {
  const groups = result.groups;
  const totalBtc = groups.reduce((sum, g) => sum + g.combinedBtc, 0);
  const floorPrice = axisFloorPrice(result);
  const shares = groups.map((g) =>
    totalBtc > 0 ? g.combinedBtc / totalBtc : 0,
  );
  const widthBoundaries = compressedShareBoundaries(shares);

  let cumulativeBtc = 0;
  const bands: LiquidationBand[] = groups.map((group, i) => {
    const shareStart = widthBoundaries[i];
    cumulativeBtc += group.combinedBtc;
    const trueShareEnd = totalBtc > 0 ? cumulativeBtc / totalBtc : 0;
    const shareEnd = widthBoundaries[i + 1];
    // Band spans from where this event triggers down to the next event's
    // trigger; the last band bottoms out at the axis floor.
    const priceBottom =
      i < groups.length - 1 ? groups[i + 1].liquidationPrice : floorPrice;
    const tone = toneFor(i);

    return {
      key: String(group.index),
      label: COPY.liquidations.eventTitle(group.index + 1),
      sublabel: COPY.liquidations.containVaults(
        group.vaults.map((v) => v.name.toLowerCase()).join(", "),
      ),
      amountLabel: formatBtcAmount(group.combinedBtc),
      priceTop: group.liquidationPrice,
      priceBottom,
      shareStart,
      shareEnd,
      state: btcPrice <= group.liquidationPrice ? "liquidated" : "live",
      tone,
      popoverMetrics: [
        {
          label: COPY.liquidations.popover.atPrice,
          value: formatPriceUsd(group.liquidationPrice),
          emphasis: true,
        },
        {
          label: COPY.liquidations.popover.distance,
          value: formatSignedPct(group.distancePct),
        },
        {
          label: COPY.liquidations.popover.vaults,
          value: group.vaults.map((v) => v.name).join(", "),
        },
        {
          label: COPY.liquidations.popover.seizes,
          value: formatBtcAmount(group.targetSeizureBtc),
        },
      ],
      cumulativeLabel: COPY.liquidations.cumulativeSeized(
        Math.round(trueShareEnd * 100),
      ),
    };
  });

  // Segmented axis: current price, each trigger price, and the floor, sorted
  // descending and deduped. Sorting (not prepending btcPrice) keeps the axis
  // ordered when the simulator drops btcPrice below a trigger — otherwise
  // segmentedFraction collapses the current-price rule and first event to the
  // top. Dedup avoids duplicate tick values (React keys) when prices coincide.
  const axisValues = Array.from(
    new Set([btcPrice, ...groups.map((g) => g.liquidationPrice), floorPrice]),
  ).sort((a, b) => b - a);
  const priceAxis: PriceAxisTick[] = axisValues.map((value) => ({
    value,
    label: formatPriceUsd(value),
  }));

  // Ticks sit at the compressed band edges but read out the true cumulative
  // share, so the axis stays honest about what the widths represent.
  let cumulativeShare = 0;
  const shareAxisTicks = [
    { fraction: 0, label: "0%" },
    ...shares.map((share, i) => {
      cumulativeShare += share;
      return {
        fraction: widthBoundaries[i + 1],
        label: `${Math.round(cumulativeShare * 100)}%`,
      };
    }),
  ];

  return {
    bands,
    priceAxis,
    shareAxisTicks,
    cards: groups.map((g) => toCard(g, btcPrice, collateralFactor)),
  };
}
