import { Loader } from "@/components/Loader";
import { Text } from "@/components/Text";
import { type ReactNode } from "react";
import { IoCheckmarkSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

export interface StepProps {
  /** Step number (1, 2, 3, etc.) */
  step: number;
  /** Currently active step number */
  currentStep: number;
  /** Step label/description */
  children: ReactNode;
  /** Optional custom className */
  className?: string;
}

/**
 * renderIcon - Returns appropriate icon based on step state
 * - Complete (past): Green checkmark
 * - Active (current): Orange spinner
 * - Pending (future): Gray number badge
 */
const renderIcon = (step: number, currentStep: number) => {
  // Complete: checkmark icon with green background
  if (currentStep > step) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light">
        <IoCheckmarkSharp size={24} className="text-accent-contrast" />
      </div>
    );
  }

  // Active: spinner with orange background
  if (currentStep === step) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-main">
        <Loader size={24} className="text-accent-contrast" />
      </div>
    );
  }

  // Pending: number badge with gray background
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-main">
      <Text variant="body1" className="text-accent-contrast">
        {step}
      </Text>
    </div>
  );
};

/**
 * Step Component - Displays a single step in a multi-step process
 * 
 * Shows different visual states based on progress:
 * - **Pending** (future): Number badge, reduced opacity
 * - **Active** (current): Spinner animation, full opacity
 * - **Complete** (past): Checkmark, full opacity
 * 
 * @example
 * ```tsx
 * <Step step={1} currentStep={2}>
 *   Complete Step
 * </Step>
 * 
 * <Step step={2} currentStep={2}>
 *   Active Step (spinner)
 * </Step>
 * 
 * <Step step={3} currentStep={2}>
 *   Pending Step
 * </Step>
 * ```
 */
export function Step({ step, currentStep, children, className }: StepProps) {
  const isActive = step === currentStep;

  return (
    <div
      className={twMerge(
        "flex w-full flex-row items-center gap-3 self-stretch rounded border border-secondary-strokeLight bg-surface p-4",
        !isActive && "opacity-25",
        className
      )}
    >
      {renderIcon(step, currentStep)}
      <Text variant="body1" className="text-accent-primary">
        Step {step}: {children}
      </Text>
    </div>
  );
}

