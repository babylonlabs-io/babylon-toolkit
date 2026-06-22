/**
 * DepositSummaryCard
 *
 * Pre-sign intro screen for the deposit flow. Renders a compact summary of the
 * four step groups (collapsed, each showing its signature count) before the
 * user starts signing. Clicking "Sign" begins the flow, after which
 * DepositProgressView takes over with the live stepper.
 *
 * Counts are derived from STEP_GROUPS (the same source the live stepper uses),
 * so the summary stays in lock-step with the real group sizes.
 */

import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

import { StepConnector } from "./StepConnector";
import { STEP_GROUPS } from "./steps";

interface DepositSummaryCardProps {
  /** Starts the deposit flow; the parent then swaps in DepositProgressView. */
  onSign: () => void;
}

export function DepositSummaryCard({ onSign }: DepositSummaryCardProps) {
  const groups = STEP_GROUPS.map((group) => ({
    title: group.title,
    total: group.endStep - group.startStep + 1,
  }));

  return (
    <div className="w-full max-w-[520px] overflow-hidden rounded-xl border border-secondary-strokeDark">
      <div className="px-6 pt-6">
        <Heading variant="h5" className="text-accent-primary">
          {COPY.deposit.progress.heading}{" "}
          <Text as="span" variant="body1" className="text-accent-secondary">
            ({COPY.deposit.progress.summary.estimate})
          </Text>
        </Heading>

        <Text variant="body2" className="mb-6 mt-2 text-accent-secondary">
          {COPY.deposit.progress.summary.description}
        </Text>
      </div>

      {/* Full-bleed divider: spans the card edge-to-edge through the padding. */}
      <div className="border-t border-secondary-strokeDark" />

      <div className="flex flex-col px-6 pt-6">
        {groups.map((group, index) => (
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
            {index < groups.length - 1 && <StepConnector />}
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 pt-6">
        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={onSign}
        >
          {COPY.deposit.progress.buttons.sign}
        </Button>
      </div>
    </div>
  );
}
