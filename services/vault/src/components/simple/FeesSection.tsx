import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Hint,
} from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { IoChevronUp } from "react-icons/io5";

export interface FeeRow {
  label: string;
  value: ReactNode;
  tooltip?: string;
}

interface FeesSectionProps {
  rows: FeeRow[];
}

export function FeesSection({ rows }: FeesSectionProps) {
  if (rows.length === 0) return null;

  return (
    <div className="border-t border-secondary-strokeLight pt-4">
      <Accordion>
        <AccordionSummary
          className="flex items-center justify-between px-0 py-0"
          iconProps={{
            variant: "outlined",
            size: "small",
            className:
              "border-0 !text-secondary-strokeDark !static !translate-y-0",
          }}
          renderIcon={(expanded) => (
            <IoChevronUp
              className={`transition-transform ${expanded ? "" : "rotate-180"}`}
            />
          )}
        >
          <span className="text-sm text-accent-primary">
            Protocol Parameters
          </span>
        </AccordionSummary>
        <AccordionDetails className="flex flex-col gap-2 px-0 pb-0 pt-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between text-sm"
            >
              <Hint tooltip={row.tooltip} className="text-accent-secondary">
                <span>{row.label}</span>
              </Hint>
              <span className="text-accent-secondary">{row.value}</span>
            </div>
          ))}
        </AccordionDetails>
      </Accordion>
    </div>
  );
}
