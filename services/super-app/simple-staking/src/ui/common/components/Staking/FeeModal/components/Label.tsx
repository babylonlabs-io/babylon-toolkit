import { Chip, Text } from "@babylonlabs-io/core-ui";

import { WarningTooltip } from "./WarningTooltip";

interface LabelProps {
  label: string;
  amount: string;
  hint: string;
  warning: boolean;
}

export const Label = ({ label, amount, warning, hint }: LabelProps) => (
  <Text
    as="span"
    className="flex flex-1 items-center justify-between"
    variant="body1"
  >
    <span>
      <b className="capitalize">{label}</b> ({amount} sat/vB)
    </span>

    <span className="inline-flex items-center gap-2">
      {warning && <WarningTooltip />}

      <Chip>{hint}</Chip>
    </span>
  </Text>
);
