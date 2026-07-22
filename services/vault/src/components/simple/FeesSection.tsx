import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Hint,
} from "@babylonlabs-io/core-ui";
import { type ReactNode, useId, useState } from "react";
import { IoAdd, IoChevronUp, IoRemove } from "react-icons/io5";

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
    <Accordion
      expanded={expanded}
      className="border-t border-secondary-strokeLight pt-4"
    >
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
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-neutral-200 text-accent-primary">
          {expanded ? <IoRemove size={16} /> : <IoAdd size={16} />}
        </span>
      </button>
      {/* AccordionDetails carries the shared dropdown motion (height +
          opacity/translate from the `--motion-*` tokens) and owns the
          collapsed visibility, so the panel animates like every other
          expandable instead of snapping open. */}
      <div id={panelId}>
        <AccordionDetails className="flex flex-col gap-2 pt-3">
          <FeeRows rows={rows} />
        </AccordionDetails>
      </div>
    </Accordion>
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
