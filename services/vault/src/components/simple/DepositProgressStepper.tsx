import { Loader, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { IoCheckmarkSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

export interface ProgressStepItem {
  label: string;
  description?: string;
}

interface DepositProgressStepperProps {
  steps: ProgressStepItem[];
  /** 1-indexed: step 1 = first step active, 0 = nothing active yet */
  currentStep: number;
  className?: string;
}

type StepState = "completed" | "active" | "pending";

function getStepState(stepIndex: number, currentStep: number): StepState {
  const stepNumber = stepIndex + 1;
  if (stepNumber < currentStep) return "completed";
  if (stepNumber === currentStep) return "active";
  return "pending";
}

function StepCircle({
  state,
  number,
}: {
  state: StepState;
  number: number;
}): ReactNode {
  const baseClasses =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-secondary-strokeDark";

  if (state === "completed") {
    return (
      <div className={baseClasses}>
        <IoCheckmarkSharp size={16} className="text-accent-primary" />
      </div>
    );
  }

  if (state === "active") {
    return (
      <div className={baseClasses}>
        <Loader size={16} className="text-secondary-strokeDark" />
      </div>
    );
  }

  return (
    <div className={baseClasses}>
      <Text
        as="span"
        variant="body2"
        className="text-center text-accent-primary"
      >
        {number}
      </Text>
    </div>
  );
}

function Connector() {
  return (
    <div className="ml-[15px] h-2.5 w-0 border-l border-dashed border-secondary-strokeDark" />
  );
}

export function DepositProgressStepper({
  steps,
  currentStep,
  className,
}: DepositProgressStepperProps) {
  return (
    <div className={twMerge("flex flex-col", className)}>
      {steps.map((step, index) => {
        const state = getStepState(index, currentStep);
        const isLast = index === steps.length - 1;

        return (
          <div key={index}>
            <div className="flex items-center gap-4">
              <StepCircle state={state} number={index + 1} />
              <div className="flex items-baseline gap-1">
                <Text as="span" variant="body2" className="text-accent-primary">
                  {step.label}
                </Text>
                {step.description && (
                  <Text as="span" variant="body2" className="text-[#b0b0b0]">
                    {step.description}
                  </Text>
                )}
              </div>
            </div>
            {!isLast && <Connector />}
          </div>
        );
      })}
    </div>
  );
}
