import type { StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { ActiveStepRow } from "./ActiveStepRow";
import { CompletedStepsPill } from "./CompletedStepsPill";
import { PendingStepRow } from "./PendingStepRow";
import { StepConnector } from "./StepConnector";

interface PostSignProgressProps {
  steps: StepperItem[];
  completedCount: number;
  /** Optional detail panel rendered inside the active step row. */
  activeStepDetail?: ReactNode;
}

export function PostSignProgress({
  steps,
  completedCount,
  activeStepDetail,
}: PostSignProgressProps) {
  const totalSteps = steps.length;
  const visibleSteps = steps.slice(completedCount);

  return (
    <div className="flex flex-col">
      <CompletedStepsPill completed={completedCount} total={totalSteps} />
      {visibleSteps.length > 0 && <StepConnector />}
      {visibleSteps.map((step, index) => {
        const stepNumber = completedCount + index + 1;
        const isActive = index === 0;
        const isLast = index === visibleSteps.length - 1;

        return (
          <div key={stepNumber}>
            {isActive ? (
              <ActiveStepRow
                number={stepNumber}
                label={step.label}
                description={step.description}
                detail={activeStepDetail}
              />
            ) : (
              <PendingStepRow number={stepNumber} label={step.label} />
            )}
            {!isLast && <StepConnector />}
          </div>
        );
      })}
    </div>
  );
}
