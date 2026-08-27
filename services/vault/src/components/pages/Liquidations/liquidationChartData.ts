import type {
  LiquidationBand,
  LiquidationBandTone,
  PriceAxisTick,
  SafeZone,
} from "@babylonlabs-io/core-ui";

import type {
  CalculatorResult,
  LiquidationGroup,
} from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import {
  formatBtcAmount,
  formatBtcValue,
  formatPriceUsd,
  formatUsd,
  getBtcSymbol,
} from "@/utils/formatting";

/**
 * Projects the liquidation cascade (`CalculatorResult.groups`) into the shapes
 * the core-ui charts + event cards consume. core-ui is a dumb renderer, so ALL
 * derivation and formatting happens here.
 *
 * Three values are derived (no new financial model — see issue #2043):
 *  - post-liquidation Health Factor: remaining collateral × price × CF ÷ debt.
 *    Uses the collateral factor, matching `calculate.ts`, NOT the SDK's
 *    liquidation-threshold HF.
 *  - fairness payment in wBTC: `fairnessPaymentUsd / group.liquidationPrice`
 *    — the event's own trigger price, not the simulated price, since the
 *    fairness payment is a property of that liquidation, not of wherever the
 *    simulator currently sits.
 */

const TONES: LiquidationBandTone[] = ["1", "2", "3"];

/** A BTC amount pre-formatted as separate parts so the card can style the
 *  number and the unit differently without re-parsing a formatted string. */
export interface AmountParts {
  amount: string;
  unit: string;
}

export interface LiquidationEventCard {
  key: string;
  title: string;
  /** Matches the band's colour lane — drives the card's top rule. */
  tone: LiquidationBandTone;
  /** The price has fallen to or through this event's trigger. */
  triggered: boolean;
  collateralLabel: string;
  liqPriceLabel: string;
  distanceLabel: string;
  /** Sign of the distance, so a consumer can tint it without re-parsing
   *  `distanceLabel`. The overview cards tint negative distances. */
  distanceNegative: boolean;
  seizedVaults: ({ name: string } & AmountParts)[];
  targetSeizure: AmountParts;
  overSeizure: AmountParts;
  collateralLiquidatedLabel: string;
  debtRepaidLabel: string;
  liquidatorProfitLabel: string;
  /** Full group shows a wBTC fairness payment; safe groups show fairness debt repaid. */
  fairness: { label: string; value: string; tooltip: string };
  btcRemainingLabel: string;
  debtRemainingLabel: string;
  hfAfterLabel: string;
}

export interface LiquidationChartData {
  bands: LiquidationBand[];
  priceAxis: PriceAxisTick[];
  shareAxisTicks: { fraction: number; label: string }[];
  cards: LiquidationEventCard[];
  summary: LiquidationSimulationSummary;
}

export interface LiquidationChartOptions {
  /** Simulated (or live) BTC price driving which bands read as liquidated. */
  btcPrice: number;
  /** Collateral factor (0–1) from on-chain params, for post-liq HF. */
  collateralFactor: number;
  /**
   * The live BTC price anchoring the top of the axis. Defaults to `btcPrice`.
   * Keeping the axis anchored here (never to the simulated price) is what lets
   * the price line move smoothly through the fixed segments while dragging,
   * instead of re-flowing the axis on every step.
   */
  livePrice?: number;
  /** Vaults in the position, for the header counts. See the summary below. */
  vaultsTotal: number;
}

/** Header figures for the analysis section at a (simulated) price. */
export interface LiquidationSimulationSummary {
  vaultsLiquidated: number;
  vaultsTotal: number;
  /** True cumulative share of collateral seized, whole percent. */
  seizedPct: number;
  /** Collateral left after the seized groups, pre-formatted. */
  collateralRemainingLabel: string;
}

/**
 * The whole position's collateral, which the groups alone do not describe:
 * `calculate()` stops emitting groups the moment the remaining debt clears, so
 * any vault it never had to consume has no group at all. What it does leave is
 * the last group's `btcRemainingAfter` — the collateral still standing once the
 * cascade is exhausted — so the true total is the seized run plus that tail.
 */
function positionCollateralBtc(result: CalculatorResult): number {
  const groups = result.groups;
  const inGroups = groups.reduce((sum, g) => sum + g.combinedBtc, 0);
  return inGroups + (groups[groups.length - 1]?.btcRemainingAfter ?? 0);
}

/**
 * What the cascade looks like at `btcPrice`: a group is seized once the price
 * is at or below its trigger — the same rule that flips a band's `state`.
 *
 * Normalised against the whole position, never against the emitted groups —
 * otherwise a position whose cascade ends early reads "100% seized / 0 BTC"
 * while the position card directly above still shows the surviving collateral.
 */
export function buildSimulationSummary(
  result: CalculatorResult,
  btcPrice: number,
  /** Vaults in the position. Not derivable: an unconsumed vault has no group. */
  vaultsTotal: number,
): LiquidationSimulationSummary {
  const totalBtc = positionCollateralBtc(result);
  const seized = result.groups.filter((g) => btcPrice <= g.liquidationPrice);
  const seizedBtc = seized.reduce((sum, g) => sum + g.combinedBtc, 0);
  return {
    vaultsLiquidated: seized.reduce((sum, g) => sum + g.vaults.length, 0),
    vaultsTotal,
    seizedPct: totalBtc > 0 ? Math.round((seizedBtc / totalBtc) * 100) : 0,
    collateralRemainingLabel: formatBtcAmount(
      Math.max(0, totalBtc - seizedBtc),
    ),
  };
}

/**
 * Headroom below the last trigger for the axis floor, so the final event reads
 * as a band rather than a hairline. The axis deliberately stops above $0.
 */
const AXIS_FLOOR_MARGIN = 0.05;

/** Bottom of the price axis: just under the last trigger, or 0 with no events.
 *  Also the simulator's lower bound. */
export function axisFloorPrice(result: CalculatorResult): number {
  const triggers = result.groups.map((g) => g.liquidationPrice);
  if (triggers.length === 0) return 0;
  return Math.min(...triggers) * (1 - AXIS_FLOOR_MARGIN);
}

/**
 * Round-number ticks the Timeline's price axis aims for above the first
 * trigger. Four keeps the safe zone legible without crowding the price pills.
 */
const TIMELINE_AXIS_TICK_TARGET = 4;

/** Guards the tick loop against a degenerate step; never reached in practice. */
const TIMELINE_AXIS_MAX_TICKS = 24;

/**
 * A round step covering `span` in roughly `target` intervals — the 1/2/2.5/5/10
 * ladder, so the ticks land on prices a depositor reads at a glance.
 */
function niceStep(span: number, target: number): number {
  const rough = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step =
    normalized >= 5 ? 10 : normalized >= 2.5 ? 5 : normalized >= 2 ? 2.5 : 1;
  return step * magnitude;
}

/**
 * The Timeline's price axis: round ticks down the safe zone, then the axis
 * floor.
 *
 * Deliberately different from the Seizure Map's segmented axis, which labels
 * every trigger. On the Timeline each trigger already carries its own dashed
 * level line and price pill, and the scale compresses the trigger-to-trigger
 * regions — round ticks placed inside them would bunch against those pills.
 *
 * `topPrice` anchors the top of the domain, so it must cover both the current
 * price and the highest candle: anything above `priceAxis[0]` is clipped.
 *
 * The floor tick carries no label: it only anchors the scale's lower domain
 * bound, and the design shows no price at the very bottom of the axis (the
 * lowest trigger already has its own pill).
 */
export function buildTimelinePriceAxis(
  result: CalculatorResult,
  topPrice: number,
): PriceAxisTick[] {
  const floorPrice = axisFloorPrice(result);
  const firstTrigger = result.groups[0]?.liquidationPrice ?? floorPrice;
  const toTick = (value: number): PriceAxisTick => ({
    value,
    label: formatPriceUsd(value),
  });
  const toFloorTick = (value: number): PriceAxisTick => ({ value, label: "" });

  if (!Number.isFinite(topPrice) || topPrice <= floorPrice) {
    return [toTick(Math.max(topPrice, floorPrice)), toFloorTick(floorPrice)];
  }

  // Below the first trigger the scale is compressed per event, so the ticks
  // stop there and the (unlabelled) floor tick closes the axis.
  const tickFloor = topPrice > firstTrigger ? firstTrigger : floorPrice;
  const span = topPrice - tickFloor;
  if (span <= 0) return [toTick(topPrice), toFloorTick(floorPrice)];

  const step = niceStep(span, TIMELINE_AXIS_TICK_TARGET);
  const ticks: PriceAxisTick[] = [];
  const top = Math.ceil(topPrice / step) * step;
  for (let i = 0; i < TIMELINE_AXIS_MAX_TICKS; i++) {
    const value = top - i * step;
    if (value <= tickFloor) break;
    ticks.push(toTick(value));
  }
  // `top` always clears `topPrice`, so the list can only be empty if the loop
  // never ran; the floor still has to close the domain.
  return [...ticks, toFloorTick(floorPrice)];
}

/**
 * The bordered callout above the first liquidation trigger: how far the price
 * can fall before anything is seized.
 */
export function buildTimelineSafeZone(
  result: CalculatorResult,
  btcPrice: number,
): SafeZone {
  const firstTrigger = result.groups[0]?.liquidationPrice ?? 0;
  const dropPct =
    btcPrice > firstTrigger ? ((btcPrice - firstTrigger) / btcPrice) * 100 : 0;
  return {
    title: COPY.liquidations.safeZone.title,
    lines: [
      COPY.liquidations.safeZone.noEventsAbove(formatPriceUsd(firstTrigger)),
      COPY.liquidations.safeZone.dropToFirstEvent(dropPct.toFixed(1)),
    ],
  };
}

/**
 * Time-axis label for a candle: the day of the month, naming the month instead
 * on the first days of one, so a multi-month window still says where it is.
 * Matches the design's date axis (5 / 12 / 19 / Jun / 8).
 */
const MONTH_LABEL_MAX_DAY = 7;

export function formatCandleDate(timeMs: number): string {
  const date = new Date(timeMs);
  return date.getUTCDate() <= MONTH_LABEL_MAX_DAY
    ? date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
    : String(date.getUTCDate());
}

/** The hovered candle's own date. Spelled out, because the axis label under it
 *  is often a bare day number that names no month. */
export function formatCandleTimestamp(timeMs: number): string {
  return new Date(timeMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Bands with the seized amount folded into the label, e.g.
 * "Liq Event 1 (0.6 BTC)". The dashboard page names the amount inline; the
 * overview preview keeps the bare event title. `amountLabel` is dropped so a
 * band tall enough for its own amount line does not print it twice.
 */
export function withAmountInBandLabel(
  bands: LiquidationBand[],
): LiquidationBand[] {
  return bands.map((band) => ({
    ...band,
    label: band.amountLabel
      ? `${band.label} (${band.amountLabel})`
      : band.label,
    amountLabel: undefined,
  }));
}

/**
 * Exponent applied to a collateral share before it becomes a band width. 1 is
 * true proportions, which renders a 1% event as an unreadable sliver; 0 is all
 * bands equal, which hides that some events seize far more. The square root
 * keeps both the ordering and a visible size difference.
 */
const SHARE_WIDTH_EXPONENT = 0.5;

/**
 * Band widths from collateral shares, compressed by {@link SHARE_WIDTH_EXPONENT}
 * and renormalised to fill the axis. Returns cumulative edges, `[0, …, 1]`.
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

// Explicit `+`: a trigger ABOVE the current price is one the cascade has
// already passed, and without a sign "18.1%" is indistinguishable from the
// "-18.1%" of an event still that far away.
function formatSignedPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** Splits a BTC amount into the parts a card styles separately, rather than
 *  handing it a pre-formatted string to re-split. */
function toAmountParts(btc: number, sign: "" | "+" = ""): AmountParts {
  return { amount: `${sign}${formatBtcValue(btc)}`, unit: getBtcSymbol() };
}

function hfAfter(group: LiquidationGroup, cf: number): string {
  if (group.debtRemainingAfter <= 0) return "∞";
  return (
    (group.btcRemainingAfter * group.liquidationPrice * cf) /
    group.debtRemainingAfter
  ).toFixed(3);
}

// `position` is the group's array index: `calculate()` emits 1-based
// `group.index`, so array position is the only safe identity for titles
// and keys. Aftermath figures are priced at the event's own trigger —
// the price at which the liquidation actually executes — never the ambient
// (possibly simulated) price.
function toCard(
  group: LiquidationGroup,
  position: number,
  cf: number,
  btcPrice: number,
): LiquidationEventCard {
  const fairness = group.isFullLiquidation
    ? {
        label: COPY.liquidations.events.fairnessPaymentWbtc,
        value: `${formatUsd(group.fairnessPaymentUsd)} (${formatBtcAmount(group.fairnessPaymentUsd / group.liquidationPrice)})`,
        tooltip: COPY.liquidations.events.fairnessPaymentTooltip,
      }
    : {
        label: COPY.liquidations.events.fairnessDebtRepaid,
        value: formatUsd(group.fairnessDebtRepay),
        tooltip: COPY.liquidations.events.fairnessDebtRepaidTooltip,
      };

  return {
    key: String(position),
    title: COPY.liquidations.eventTitle(position + 1),
    // Same rule as a band's `state`, so a card and its band can never
    // disagree about whether the event has fired.
    triggered: btcPrice <= group.liquidationPrice,
    tone: toneFor(position),
    collateralLabel: formatBtcAmount(group.combinedBtc),
    liqPriceLabel: formatPriceUsd(group.liquidationPrice),
    distanceLabel: formatSignedPct(group.distancePct),
    distanceNegative: group.distancePct < 0,
    seizedVaults: group.vaults.map((v) => ({
      name: v.name,
      ...toAmountParts(v.btc),
    })),
    targetSeizure: toAmountParts(group.targetSeizureBtc),
    overSeizure: toAmountParts(group.overSeizureBtc, "+"),
    collateralLiquidatedLabel: formatBtcAmount(group.combinedBtc),
    debtRepaidLabel: formatUsd(group.debtRepaid),
    liquidatorProfitLabel: formatUsd(group.liquidatorProfitUsd),
    fairness,
    btcRemainingLabel: formatBtcAmount(group.btcRemainingAfter),
    debtRemainingLabel: formatUsd(group.debtRemainingAfter),
    hfAfterLabel: hfAfter(group, cf),
  };
}

export function buildLiquidationChartData(
  result: CalculatorResult,
  {
    btcPrice,
    collateralFactor,
    livePrice,
    vaultsTotal,
  }: LiquidationChartOptions,
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
      key: String(i),
      label: COPY.liquidations.eventTitle(i + 1),
      accessibleDetail: COPY.liquidations.containVaults(
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

  // Segmented axis: the LIVE price, each trigger price, and the floor, sorted
  // descending and deduped. The simulated price is deliberately NOT a tick —
  // the chart interpolates it within its segment, so the line moves
  // progressively while dragging and never mints an empty segment below the
  // floor. Sorting keeps the axis ordered when the live price sits below a
  // trigger; dedup avoids duplicate tick values (React keys) when prices
  // coincide.
  const axisAnchor = livePrice ?? btcPrice;
  // A price-feed miss (NaN/Infinity) must degrade the axis, not crash the
  // chart's strictly-descending assertion downstream.
  const axisValues = Array.from(
    new Set(
      [axisAnchor, ...groups.map((g) => g.liquidationPrice), floorPrice].filter(
        (value) => Number.isFinite(value),
      ),
    ),
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

  // Header figures, bundled here so they can never be paired with a different
  // price than the bands. Deliberately the SAME `buildSimulationSummary` the
  // overview card uses: two definitions of "seized" would print two different
  // percentages for one position. `combinedBtc` IS the seized amount
  // (`calculate.ts` sets it from the prefix sum of the seized vaults), so
  // summing `targetSeizureBtc + overSeizureBtc` instead would overstate the
  // share whenever the seizure loop exits on its tolerance slack — enough to
  // print ">100% seized" beside a 100% share axis.
  const summary = buildSimulationSummary(result, btcPrice, vaultsTotal);

  return {
    bands,
    priceAxis,
    shareAxisTicks,
    cards: groups.map((g, i) => toCard(g, i, collateralFactor, btcPrice)),
    summary,
  };
}
