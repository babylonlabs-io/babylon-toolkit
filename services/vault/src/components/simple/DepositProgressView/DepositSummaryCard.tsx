/**
 * DepositSummaryCard
 *
 * Pre-sign intro state of the deposit flow. Renders inside the shared
 * DepositCardShell, supplying the collapsed group list (each group with its
 * signature count) as the body and a single "Sign" CTA as the footer. Clicking
 * "Sign" begins the flow, after which the live stepper renders the expanded
 * groups inside the same shell.
 *
 * Counts are derived from STEP_GROUPS (the same source the live stepper uses),
 * so the summary stays in lock-step with the real group sizes.
 */

import { Button, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

import { DepositCardShell } from "./DepositCardShell";
import { StepConnector } from "./StepConnector";
import { STEP_GROUPS } from "./steps";

interface DepositSummaryCardProps {
  /** Starts the deposit flow; the parent then swaps in DepositProgressView. */
  onSign: () => void;
}

// Hoisted: derived purely from the static STEP_GROUPS, so the same array
// instance is reused across renders (no per-render allocation).
const SUMMARY_GROUPS = STEP_GROUPS.map((group) => ({
  title: group.title,
  total: group.endStep - group.startStep + 1,
}));

export function DepositSummaryCard({ onSign }: DepositSummaryCardProps) {
  return (
    <DepositCardShell
      footer={
        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={onSign}
        >
          {COPY.deposit.progress.buttons.sign}
        </Button>
      }
    >
      <div className="flex flex-col">
        {SUMMARY_GROUPS.map((group, index) => (
          <div key={group.title} className="flex flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-secondary-strokeDark">
                <Text
                  as="span"
                  variant="body2"
                  className="font-medium text-accent-secondary"
                >
                  {index + 1}
                </Text>
              </div>
              <Text
                as="span"
                variant="body1"
                className="flex-1 font-medium text-accent-primary"
              >
                {group.title}
              </Text>
              <Text as="span" variant="body2" className="text-accent-secondary">
                {COPY.deposit.groups.stepCounter(0, group.total)}
              </Text>
            </div>
            {index < SUMMARY_GROUPS.length - 1 && <StepConnector />}
          </div>
        ))}
      </div>
    </DepositCardShell>
  );
}
