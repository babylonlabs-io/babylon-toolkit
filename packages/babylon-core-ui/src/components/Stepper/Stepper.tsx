import { type ReactNode } from "react";
import { IoCheckmarkSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

import { Loader } from "@/components/Loader";
import { Text } from "@/components/Text";

export interface StepperItem {
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepperItem[];
  currentStep: number;
  className?: string;
}

type StepState = "completed" | "active" | "pending";

function getStepState(
  stepIndex: number,
  currentStep: number,
): StepState {
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
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

  if (state === "completed") {
    return (
      <div className={twMerge(baseClasses, "bg-primary-light")}>
        <IoCheckmarkSharp size={16} className="text-accent-contrast" />
      </div>
    );
  }

  if (state === "active") {
    return (
      <div className={twMerge(baseClasses, "bg-secondary-main")}>
        <Loader size={16} className="text-accent-contrast" />
      </div>
    );
  }

  return (
    <div
      className={twMerge(
        baseClasses,
        "border-2 border-secondary-strokeDark",
      )}
    >
      <Text
        as="span"
        variant="body2"
        className="font-medium text-accent-secondary"
      >
        {number}
      </Text>
    </div>
  );
}

function Connector({ state }: { state: StepState }) {
  return (
    <div
      className={twMerge(
        "ml-[15px] h-6 w-0",
        state === "pending"
          ? "border-l-2 border-dashed border-secondary-strokeLight"
          : "border-l-2 border-solid border-secondary-strokeDark",
      )}
    />
  );
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <div className={twMerge("flex flex-col", className)}>
      {steps.map((step, index) => {
        const state = getStepState(index, currentStep);
        const isLast = index === steps.length - 1;

        return (
          <div key={index}>
            <div className="flex items-center gap-3">
              <StepCircle state={state} number={index + 1} />
              <div className="flex items-baseline gap-2">
                <Text
                  as="span"
                  variant="body1"
                  className={twMerge(
                    "font-medium",
                    state === "pending"
                      ? "text-accent-secondary"
                      : "text-accent-primary",
                  )}
                >
                  {step.label}
                </Text>
                {step.description && (
                  <Text
                    as="span"
                    variant="body2"
                    className="text-accent-secondary"
                  >
                    {step.description}
                  </Text>
                )}
              </div>
            </div>
            {!isLast && (
              <Connector
                state={getStepState(index + 1, currentStep)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
