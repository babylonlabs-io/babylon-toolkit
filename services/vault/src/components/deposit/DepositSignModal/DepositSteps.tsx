import { Step } from "@babylonlabs-io/core-ui";

import { STEP_LABELS } from "./constants";

interface DepositStepsProps {
  currentStep: number;
}

/**
 * 4-step progress indicator for deposit flow
 */
export function DepositSteps({ currentStep }: DepositStepsProps) {
  return (
    <div className="flex flex-col items-start gap-4 py-4">
      {STEP_LABELS.map((label, index) => (
        <Step key={index} step={index + 1} currentStep={currentStep}>
          {label}
        </Step>
      ))}
    </div>
  );
}
