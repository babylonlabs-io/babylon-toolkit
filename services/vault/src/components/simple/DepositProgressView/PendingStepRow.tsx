import { Text } from "@babylonlabs-io/core-ui";

interface PendingStepRowProps {
  number: number;
  label: string;
}

export function PendingStepRow({ number, label }: PendingStepRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-secondary-strokeDark">
        <Text
          as="span"
          variant="body2"
          className="font-medium text-accent-secondary"
        >
          {number}
        </Text>
      </div>
      <Text as="span" variant="body2" className="text-accent-secondary">
        {label}
      </Text>
    </div>
  );
}
