import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Hint,
} from "@babylonlabs-io/core-ui";
import { type ReactNode, useId, useState } from "react";
import { IoChevronUp } from "react-icons/io5";

import { FeatureFlags } from "@/config";
import { COPY } from "@/copy";

export interface FeeRow {
  label: string;
  value: ReactNode;
  tooltip?: string;
}

interface FeesSectionProps {
  rows: FeeRow[];
}

function FeeRows({ rows }: FeesSectionProps) {
  return (
    <>
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
    </>
  );
}

function FeesSectionV3({ rows }: FeesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <div className="border-t border-secondary-strokeLight pt-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-sm text-accent-primary">
          {COPY.protocolFees.sectionTitle}
        </span>
        <IoChevronUp
          className={`text-secondary-strokeDark transition-transform ${expanded ? "" : "rotate-180"}`}
        />
      </button>
      <div id={panelId} hidden={!expanded} className="flex flex-col gap-2 pt-3">
        <FeeRows rows={rows} />
      </div>
    </div>
  );
}

export function FeesSection({ rows }: FeesSectionProps) {
  if (rows.length === 0) return null;

  if (FeatureFlags.isV3UiEnabled) {
    return <FeesSectionV3 rows={rows} />;
  }

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
            Protocol parameters
          </span>
        </AccordionSummary>
        <AccordionDetails className="flex flex-col gap-2 px-0 pb-0 pt-3">
          <FeeRows rows={rows} />
        </AccordionDetails>
      </Accordion>
    </div>
  );
}
