import { Stepper, type StepperItem } from "@babylonlabs-io/core-ui";

import { STEP_LABELS } from "./constants";

interface DepositStepsProps {
  currentStep: number;
}

const steps: StepperItem[] = STEP_LABELS.map((label) => ({ label }));

/**
 * 4-step progress indicator for deposit flow using the vertical Stepper
 */
export function DepositSteps({ currentStep }: DepositStepsProps) {
  return <Stepper steps={steps} currentStep={currentStep} className="py-4" />;
}
