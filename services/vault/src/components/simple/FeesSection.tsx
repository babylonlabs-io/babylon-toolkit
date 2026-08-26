import { Accordion, AccordionDetails } from "@babylonlabs-io/core-ui";
import { type ReactNode, useId, useState } from "react";
import { IoAdd, IoRemove } from "react-icons/io5";

import { FeeDetailRow } from "@/components/shared/DetailRow";
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
        <FeeDetailRow
          key={row.label}
          label={row.label}
          tooltip={row.tooltip}
          value={row.value}
        />
      ))}
    </>
  );
}

export function FeesSection({ rows }: FeesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  if (rows.length === 0) return null;

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
