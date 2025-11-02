import type React from "react";
import { twJoin } from "tailwind-merge";
import { Slider, type SliderStep } from "../../../components/Slider";

interface BalanceDetails {
  balance: number | string;
  symbol: string;
  price?: number;
  displayUSD?: boolean;
}

interface BottomField {
  label?: string;
  value: string | React.ReactNode;
}

export interface AmountSliderProps {
  // Amount input
  amount: string | number;
  currencyIcon: string;
  currencyName: string;
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
  
  // Bottom fields
  leftField?: BottomField;
  rightField?: BottomField;
  onMaxClick?: () => void;
  
  // General
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function AmountSlider({
  amount,
  currencyIcon,
  currencyName,
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
  leftField,
  rightField,
  onMaxClick,
  disabled = false,
  readOnly = false,
  className,
}: AmountSliderProps) {
  // Prevent arrow key increments
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
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
      {/* Row 1: Icon + Name + Input */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={currencyIcon} alt={currencyName} className="h-10 w-10" />
          <span className="text-lg text-accent-primary">{currencyName}</span>
        </div>
        <input
          type="number"
          value={amount}
          onChange={onAmountChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          readOnly={readOnly || !onAmountChange}
          placeholder="0"
          className="w-2/3 bg-transparent text-right text-lg outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-accent-primary"
        />
      </div>

      {/* Row 2: Slider */}
      <div
        className={twJoin(
          backgroundColor &&
            "[&_.bbn-slider]:[--slider-inactive-color:var(--slider-bg-color)] dark:[&_.bbn-slider]:[--slider-inactive-color:#5a5a5a]"
        )}
        style={
          backgroundColor
            ? ({ "--slider-bg-color": backgroundColor } as React.CSSProperties)
            : undefined
        }
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
          disabled={disabled}
        />
      </div>

      {/* Row 3: Max button + Balance | USD Value */}
      <div className="flex items-center justify-between text-sm">
        {/* Left: Max button + available amount */}
        {leftField && onMaxClick && leftField.label?.toLowerCase() === "max" ? (
          <button
            type="button"
            onClick={onMaxClick}
            disabled={disabled}
            className="flex items-center gap-2 text-accent-secondary hover:text-accent-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="cursor-pointer rounded-[8px] border border-gray-300 bg-transparent px-2 py-0.5 text-xs tracking-[0.4px] hover:opacity-90 dark:border-[#2F2F2F] dark:bg-[#2F2F2F]">
              Max
            </span>
            <span>{leftField.value}</span>
          </button>
        ) : (
          leftField && (
            <span className="text-accent-secondary">
              {leftField.label && `${leftField.label}: `}
              {leftField.value}
            </span>
          )
        )}
        
        {/* Right: USD value */}
        {rightField && (
          <span className="text-accent-secondary">{rightField.value}</span>
        )}
      </div>
    </div>
  );
}
