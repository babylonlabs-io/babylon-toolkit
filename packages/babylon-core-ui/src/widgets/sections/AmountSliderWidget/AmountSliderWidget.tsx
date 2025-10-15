import type React from "react";
import { twJoin } from "tailwind-merge";
import { SubSection } from "../../../components/SubSection";
import { AmountItem } from "../../../components/AmountItem";
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

export interface AmountSliderWidgetProps {
  // Amount section
  amount: string | number;
  currencyIcon: string;
  currencyName: string;
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  balanceDetails?: BalanceDetails;
  
  // Slider section
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep?: number;
  sliderSteps?: SliderStep[];
  onSliderChange: (value: number) => void;
  sliderVariant?: "primary" | "success" | "warning" | "error" | "rainbow";
  
  // Bottom fields (optional)
  leftField?: BottomField;
  rightField?: BottomField;
  
  // General
  disabled?: boolean;
  className?: string;
}

export function AmountSliderWidget({
  amount,
  currencyIcon,
  currencyName,
  onAmountChange,
  balanceDetails,
  sliderValue,
  sliderMin,
  sliderMax,
  sliderStep = 1,
  sliderSteps,
  onSliderChange,
  sliderVariant = "primary",
  leftField,
  rightField,
  disabled = false,
  className,
}: AmountSliderWidgetProps) {
  const amountValue = parseFloat(String(amount) || "0");
  const amountUsd = balanceDetails?.price
    ? `$${(amountValue * balanceDetails.price).toFixed(2)} USD`
    : "";

  const subtitle = balanceDetails
    ? `Max: ${balanceDetails.balance} ${balanceDetails.symbol}`
    : "";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  return (
    <SubSection className={twJoin("flex w-full flex-col gap-4", className)}>
      {/* Amount Item */}
      <AmountItem
        amount={amount}
        currencyIcon={currencyIcon}
        currencyName={currencyName}
        placeholder="0"
        displayBalance={!!balanceDetails}
        balanceDetails={balanceDetails}
        min="0"
        step="any"
        autoFocus={false}
        onChange={onAmountChange}
        onKeyDown={handleKeyDown}
        amountUsd={amountUsd}
        subtitle={subtitle}
        disabled={disabled}
      />

      {/* Slider */}
      <Slider
        value={sliderValue}
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        steps={sliderSteps}
        onChange={onSliderChange}
        variant={sliderVariant}
        disabled={disabled}
      />

      {/* Bottom Fields */}
      {(leftField || rightField) && (
        <div className="flex items-center justify-between text-sm">
          {leftField && (
            <span className="text-accent-secondary">
              {leftField.label && `${leftField.label}: `}
              {leftField.value}
            </span>
          )}
          {rightField && (
            <span className="text-accent-secondary">{rightField.value}</span>
          )}
        </div>
      )}
    </SubSection>
  );
}


