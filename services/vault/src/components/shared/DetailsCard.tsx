/**
 * Generic DetailsCard component for rendering key-value pairs
 */

import { SubSection } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

export interface DetailRow {
  label: string;
  value: ReactNode;
}

interface DetailsCardProps {
  rows: DetailRow[];
}

export function DetailsCard({ rows }: DetailsCardProps) {
  if (rows.length === 0) return null;

  return (
    <SubSection>
      <div className="divide-y divide-secondary-strokeLight">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
          >
            <span className="text-sm text-accent-secondary">{row.label}</span>
            <span className="text-base text-accent-primary">{row.value}</span>
          </div>
        ))}
      </div>
    </SubSection>
  );
}
