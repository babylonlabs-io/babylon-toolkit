/**
 * DepositCardShell
 *
 * Presentational chrome shared by every state of the deposit progress flow.
 * It owns the card border, the heading + time estimate, the explanation, an
 * optional overall progress bar, the full-bleed divider, the step/group body,
 * and a footer region (primary CTA + optional fine print).
 *
 * The body is intentionally a `children` slot so the same card can host either
 * state of the flow:
 *   - pre-sign  → DepositSummaryCard passes the collapsed group rows
 *   - in-flight → the live stepper passes its expanded GroupedProgress (with
 *                 per-step detail panels), a progress bar, and the
 *                 close-and-continue CTA + do-not-spend footnote
 *
 * Keeping the chrome here means the user sees one consistent card from the
 * summary through completion — only the body and footer change per state.
 */

import { Heading, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { COPY } from "@/copy";

import { DEPOSIT_VIEW_MAX_WIDTH_CLASS } from "./steps";

interface DepositCardShellProps {
  /**
   * Step/group list. Collapsed group rows in the summary state; the expanded
   * grouped stepper (with active-step detail panels) in the live state.
   */
  children: ReactNode;
  /**
   * Footer action(s) for the current state — e.g. the "Sign" CTA on the
   * summary, or the close-and-continue button while the flow runs.
   */
  footer: ReactNode;
  /**
   * Optional overall progress bar rendered under the explanation. Present once
   * signing starts; omitted on the pre-sign summary.
   */
  progressBar?: ReactNode;
  /**
   * Optional fine print rendered under the footer action — e.g. the
   * do-not-spend warning shown while the deposit is in flight.
   */
  footnote?: ReactNode;
}

export function DepositCardShell({
  children,
  footer,
  progressBar,
  footnote,
}: DepositCardShellProps) {
  return (
    <div
      className={`w-full ${DEPOSIT_VIEW_MAX_WIDTH_CLASS} overflow-hidden rounded-xl border border-secondary-strokeDark`}
    >
      <div className="px-6 pb-6 pt-6">
        <Heading variant="h5" className="text-accent-primary">
          {COPY.deposit.progress.heading}{" "}
          <Text as="span" variant="body1" className="text-accent-secondary">
            ({COPY.deposit.progress.summary.estimate})
          </Text>
        </Heading>

        <Text variant="body2" className="mt-2 text-accent-secondary">
          {COPY.deposit.progress.summary.description}
        </Text>

        {progressBar && <div className="mt-4">{progressBar}</div>}
      </div>

      {/* Full-bleed divider: spans the card edge-to-edge through the padding. */}
      <div className="border-t border-secondary-strokeDark" />

      <div className="px-6 py-6">{children}</div>

      <div className="px-6 pb-6">
        {footer}
        {footnote && <div className="mt-4">{footnote}</div>}
      </div>
    </div>
  );
}
