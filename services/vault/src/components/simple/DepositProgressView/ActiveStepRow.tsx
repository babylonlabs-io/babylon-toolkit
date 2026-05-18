import { Loader, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

interface ActiveStepRowProps {
  number: number;
  label: string;
  description?: string;
  /** Optional detail panel rendered below the label (e.g. BTC confirmation status). */
  detail?: ReactNode;
}

export function ActiveStepRow({
  number,
  label,
  description,
  detail,
}: ActiveStepRowProps) {
  return (
    <div className="flex gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-secondary-strokeDark"
        aria-label={`Step ${number} active`}
      >
        <Loader size={16} className="text-accent-primary" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <Text
            as="span"
            variant="body1"
            className="font-medium text-accent-primary"
          >
            {label}
          </Text>
          {description && (
            <Text as="span" variant="body2" className="text-accent-secondary">
              {description}
            </Text>
          )}
        </div>
        {detail}
      </div>
    </div>
  );
}
