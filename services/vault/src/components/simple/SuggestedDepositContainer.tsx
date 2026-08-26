import { IoInformationCircle } from "react-icons/io5";

import { COPY } from "@/copy";

interface SuggestedDepositContainerProps {
  /** Suggested amount, already formatted with its coin symbol (e.g. "0.333 BTC"). */
  suggestedAmountLabel: string;
  /** True when the entered amount already equals the suggestion. */
  isSelected: boolean;
  /** Applies the suggested amount to the input (drives normal validation + fees). */
  onSelect: () => void;
}

export function SuggestedDepositContainer({
  suggestedAmountLabel,
  isSelected,
  onSelect,
}: SuggestedDepositContainerProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-center transition-colors ${
        isSelected
          ? "border-accent-primary"
          : "border-secondary-strokeLight hover:border-accent-primary"
      }`}
    >
      <IoInformationCircle size={18} className="shrink-0 text-accent-primary" />
      <span className="min-w-0 text-sm text-accent-secondary">
        {COPY.deposit.form.suggestedDepositLabel}{" "}
        <span className="text-accent-primary">{suggestedAmountLabel}</span>
      </span>
    </button>
  );
}
