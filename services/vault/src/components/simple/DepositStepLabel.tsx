/**
 * DepositStepLabel
 *
 * "Step X of Y — <label>" line shown beneath the amount on pending deposit
 * cards. The accompanying progress bar is rendered separately (full width).
 */

import { COPY } from "@/copy";

interface DepositStepLabelProps {
  /** 1-based current step within the deposit flow. */
  visualStep: number;
  /** Total number of steps in the deposit flow. */
  totalSteps: number;
  /** Human-readable label for the current step. */
  label: string;
}

export function DepositStepLabel({
  visualStep,
  totalSteps,
  label,
}: DepositStepLabelProps) {
  return (
    <span className="text-sm">
      <span className="text-accent-secondary">
        {COPY.pegin.progress.stepCounter(visualStep, totalSteps)}{" "}
      </span>
      <span className="font-medium text-accent-primary">{label}</span>
    </span>
  );
}
