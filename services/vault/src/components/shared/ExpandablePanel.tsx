import { Accordion, AccordionDetails } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

interface ExpandablePanelProps {
  /** When true the panel reveals its content with a height + fade animation. */
  expanded: boolean;
  children: ReactNode;
}

/**
 * Animated reveal for the dashboard summary cards (Pending Deposits, Collateral,
 * Loans, etc.). Wraps content in the core-ui Accordion so it opens with the same
 * smooth height + fade motion as the deposit flow's vault provider selector.
 * Content stays unmounted while collapsed, matching the prior conditional render.
 */
export function ExpandablePanel({ expanded, children }: ExpandablePanelProps) {
  return (
    <Accordion expanded={expanded}>
      <AccordionDetails unmountOnExit className="flex-col">
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
