import type React from "react";
import { useEffect, useState } from "react";
import { twJoin, twMerge } from "tailwind-merge";
import { Hint } from "../../../components/Hint/Hint";
import { Slider, type SliderStep } from "../../../components/Slider";
import { sanitizeNumericInput } from "../../../utils/helpers";

function toNumber(amount: string | number): number {
  return typeof amount === "number" ? amount : parseFloat(amount);
}

function formatForInput(amount: string | number): string {
  const num = toNumber(amount);
  if (!Number.isFinite(num) || num === 0) return "";
  // String(num) goes exponential below 1e-6 (dust "3e-8"); render fixed-point.
  return num.toLocaleString("en-US", {
    maximumFractionDigits: 20,
    useGrouping: false,
  });
}

interface BalanceDetails {
  balance: number | string;
  symbol: string;
  price?: number;
  displayUSD?: boolean;
}

interface BottomField {
  label?: string;
  value: string | React.ReactNode;
  /**
   * Optional explanatory tooltip rendered as an info-icon adjacent to the
   * field. Renders nothing when omitted.
   */
  tooltip?: React.ReactNode;
}

export interface AmountSliderProps {
  // Amount input
  amount: string | number;
  currencyIcon: string;
  currencyName: string;
  /**
   * Optional element rendered in place of the default currency icon + name
   * (e.g. an asset-selector pill). When omitted, the icon + name render.
   */
  currencySlot?: React.ReactNode;
  onAmountChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; // Optional - if not provided, input is read-only

  // Balance details
  balanceDetails?: BalanceDetails;

  // Slider
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep?: number;
  sliderSteps?: SliderStep[] | number;
  onSliderChange: (value: number) => void;
  onSliderStepsChange?: (selectedSteps: number[]) => void; // Called when sliderSteps is array
  sliderVariant?: "primary" | "success" | "warning" | "error" | "rainbow";
  sliderActiveColor?: string;
  sliderBackgroundColor?: string;
  /**
   * Disables only the range slider, leaving the amount input and Max button
   * usable. Use when the slider has no meaningful range yet (e.g. the max is
   * still loading) but manual entry should remain available. Combined with the
   * general `disabled` prop, which disables the whole widget.
   */
  sliderDisabled?: boolean;

  // Bottom fields
  leftField?: BottomField;
  rightField?: BottomField;
  onMaxClick?: () => void;
  /**
   * Controls which side of the bottom row the Max button appears on.
   * Defaults to "left" (current behaviour). Set to "right" to render the Max
   * button at the trailing end of the right field instead.
   */
  maxPosition?: "left" | "right";
  /** Extra classes for the Max button pill (merged over the defaults). */
  maxButtonClassName?: string;

  // General
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  inputClassName?: string;
}

export function AmountSlider({
  amount,
  currencyIcon,
  currencyName,
  currencySlot,
  onAmountChange,
  sliderValue,
  sliderMin,
  sliderMax,
  sliderStep = 1,
  sliderSteps,
  onSliderChange,
  onSliderStepsChange,
  sliderVariant = "primary",
  sliderActiveColor,
  sliderBackgroundColor,
  sliderDisabled = false,
  leftField,
  rightField,
  onMaxClick,
  maxPosition = "left",
  maxButtonClassName,
  disabled = false,
  readOnly = false,
  className,
  inputClassName,
}: AmountSliderProps) {
  // Local string mirror so partial decimals like "0." survive a re-render
  // (a controlled `value={amount}` would collapse "0." back to "0").
  const [rawInput, setRawInput] = useState<string>(() => formatForInput(amount));

  // Sync from external amount changes (Max, slider, reset). Skip when the
  // current string already parses to the same number — that's the user
  // mid-typing case.
  useEffect(() => {
    const external = toNumber(amount);
    const current = parseFloat(rawInput);
    const sameNumber =
      (Number.isFinite(current) && current === external) || (!Number.isFinite(current) && !Number.isFinite(external));
    if (sameNumber) return;
    setRawInput(formatForInput(amount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeNumericInput(e.target.value);
    if (value === undefined) {
      e.target.value = rawInput;
      return;
    }
    setRawInput(value);
    e.target.value = value;
    onAmountChange?.(e);
  };

  // Determine the background color
  // If sliderBackgroundColor is explicitly provided, use it
  // Otherwise, if sliderActiveColor is provided, generate a lighter version
  // Otherwise, don't apply any custom background
  const backgroundColor = sliderBackgroundColor
    ? sliderBackgroundColor
    : sliderActiveColor
      ? `color-mix(in srgb, ${sliderActiveColor} 20%, white)`
      : undefined;

  return (
    <div className={twJoin("flex w-full flex-col gap-4", className)}>
      {/* Row 1: Icon + Name (or custom slot) + Input */}
      <div className="flex w-full items-center justify-between">
        {currencySlot ?? (
          <div className="flex items-center gap-2">
            <img src={currencyIcon} alt={currencyName} className="h-10 w-10" />
            <span className="whitespace-nowrap text-lg text-accent-primary">{currencyName}</span>
          </div>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={rawInput}
          onChange={handleAmountChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          readOnly={readOnly || !onAmountChange}
          placeholder="0"
          className={twMerge(
            "w-2/3 bg-transparent text-right text-lg text-accent-primary outline-none",
            inputClassName,
          )}
        />
      </div>

      {/* Row 2: Slider */}
      <div
        className={twJoin(
          backgroundColor &&
            "[&_.bbn-slider]:[--slider-inactive-color:var(--slider-bg-color)] dark:[&_.bbn-slider]:[--slider-inactive-color:#5a5a5a]",
        )}
        style={backgroundColor ? ({ "--slider-bg-color": backgroundColor } as React.CSSProperties) : undefined}
      >
        <Slider
          value={sliderValue}
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          steps={sliderSteps}
          onChange={onSliderChange}
          onStepsChange={onSliderStepsChange}
          variant={sliderVariant}
          activeColor={sliderActiveColor}
          disabled={disabled || sliderDisabled}
        />
      </div>

      {/* Row 3: Max button + Balance | USD Value */}
      <div className="flex items-center justify-between text-sm">
        {/* Left: Max button + available amount (+ optional tooltip) */}
        {leftField && (
          <div className="flex items-center gap-2">
            {onMaxClick && maxPosition === "left" && leftField.label?.toLowerCase() === "max" ? (
              <button
                type="button"
                onClick={onMaxClick}
                disabled={disabled}
                className="flex items-center gap-2 text-accent-secondary transition-colors hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={twMerge(
                    "cursor-pointer rounded-[8px] bg-transparent px-2 py-0.5 text-xs tracking-[0.4px] hover:opacity-90 dark:bg-primary-contrast",
                    maxButtonClassName,
                  )}
                >
                  Max
                </span>
                <span>{leftField.value}</span>
              </button>
            ) : (
              <span className="text-accent-secondary">
                {leftField.label && `${leftField.label}: `}
                {leftField.value}
              </span>
            )}
            {leftField.tooltip && <Hint tooltip={leftField.tooltip} />}
          </div>
        )}

        {/* Right: USD value (or balance + Max button when maxPosition="right") */}
        {rightField && (
          <div className="flex items-center gap-2 text-accent-secondary">
            <span>
              {rightField.label && `${rightField.label}: `}
              {rightField.value}
            </span>
            {rightField.tooltip && <Hint tooltip={rightField.tooltip} />}
            {onMaxClick && maxPosition === "right" && (
              <button
                type="button"
                onClick={onMaxClick}
                disabled={disabled}
                className="flex items-center gap-2 transition-colors hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={twMerge(
                    "cursor-pointer rounded-[8px] bg-transparent px-2 py-0.5 text-xs tracking-[0.4px] hover:opacity-90 dark:bg-primary-contrast",
                    maxButtonClassName,
                  )}
                >
                  Max
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
