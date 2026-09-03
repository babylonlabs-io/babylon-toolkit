import { Slider } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { COPY } from "@/copy";
import { formatPriceUsd } from "@/utils/formatting";

/**
 * Slider granularity. $100 keeps the whole cascade reachable without the thumb
 * snapping past a trigger price.
 */
const PRICE_STEP_USD = 100;

interface SimulationToolbarProps {
  livePrice: number;
  /** Lowest price worth simulating; the cascade is fully resolved below it. */
  floorPrice: number;
  price: number;
  onPriceChange: (price: number) => void;
}

/**
 * Numeric entry for the simulated price. Kept as free text while focused so a
 * partial number ("8", "88,") isn't clamped mid-typing; commits on blur/Enter.
 */
function PriceInput({
  price,
  min,
  max,
  onCommit,
  disabled,
}: {
  price: number;
  min: number;
  max: number;
  onCommit: (price: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [price]);

  const commit = () => {
    if (draft === null) return;
    const cleaned = draft.replace(/[^0-9.]/g, "");
    setDraft(null);
    if (cleaned === "") return;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return;
    onCommit(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      aria-label={COPY.liquidations.simulatePriceEntryLabel}
      value={draft ?? formatPriceUsd(price)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="h-10 w-[110px] shrink-0 rounded-lg bg-secondary-highlight text-center text-base leading-[1.5] tracking-[0.15px] text-accent-primary outline-none focus:ring-1 focus:ring-secondary-strokeLight disabled:cursor-not-allowed disabled:text-accent-secondary"
    />
  );
}

export function SimulationToolbar({
  livePrice,
  floorPrice,
  price,
  onPriceChange,
}: SimulationToolbarProps) {
  const isSimulating = price !== livePrice;

  // A native range input only lands on `min + n*step`. `floorPrice` isn't
  // step-aligned with `livePrice`, so realign the slider's own min down to
  // the nearest step below it — this guarantees `livePrice` itself sits on
  // the grid and is reachable by dragging fully right.
  //
  // The inner `Math.max(0, …)` guards an already-liquidatable position, where
  // the live price sits BELOW the axis floor: the span would go negative and
  // put the min above `livePrice`, and a range input with `min > max` silently
  // clamps `max` to `min`, pinning the thumb and making every typed price a
  // no-op. The outer one keeps the min off negative prices: rounding the span
  // UP to a whole step overshoots by up to one step, which lands below zero
  // whenever the lowest trigger is under ~$105 (ordinary on a well
  // over-collateralised position). A range input accepts a negative `min`
  // happily, so a full-left drag would otherwise feed a negative price into
  // `calculate()` and paint `$-23.00` on the axis. `PriceInput` strips `-`,
  // so only the slider could reach it.
  const sliderMin = Math.max(
    0,
    livePrice -
      Math.ceil(Math.max(0, livePrice - floorPrice) / PRICE_STEP_USD) *
        PRICE_STEP_USD,
  );

  // Nothing left to simulate down to: the whole cascade already sits at or
  // above the live price. `min === max` makes the core-ui Slider divide by a
  // zero span, and the resulting `NaN%` colour stop invalidates the entire
  // `background` declaration, dropping the track fill — so the control would
  // render broken-but-live rather than plainly unavailable.
  const simulatorDisabled = sliderMin >= livePrice;

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Wrapping (rather than an external aria-label) is the only way to
          give the Slider's native input an accessible name without adding a
          prop core-ui doesn't expose. */}
      <label className="flex min-w-[200px] flex-1 items-center gap-4">
        <span className="shrink-0 text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
          {COPY.liquidations.simulateLabel}
        </span>

        {/* `steps={[]}` opts out of the default 5 step markers, which Figma's
            continuous track doesn't have. */}
        <div className="flex-1">
          <Slider
            value={price}
            min={sliderMin}
            max={livePrice}
            step={PRICE_STEP_USD}
            steps={[]}
            onChange={onPriceChange}
            variant="primary"
            disabled={simulatorDisabled}
          />
        </div>
      </label>

      {/* Same lower bound as the slider: with `floorPrice` here, prices the
          slider can reach (it aligns its min to a step at or below the floor)
          could not be typed. */}
      <PriceInput
        price={price}
        min={sliderMin}
        max={livePrice}
        onCommit={onPriceChange}
        disabled={simulatorDisabled}
      />

      <button
        type="button"
        onClick={() => onPriceChange(livePrice)}
        disabled={!isSimulating}
        className="h-10 w-[110px] shrink-0 rounded-lg bg-secondary-highlight text-base leading-[1.5] tracking-[0.15px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-secondary"
      >
        {COPY.liquidations.reset}
      </button>
    </div>
  );
}
