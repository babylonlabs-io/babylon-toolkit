import { Text } from "@babylonlabs-io/core-ui";

interface SigningProgressProps {
  signed: number;
  total: number;
}

export function SigningProgress({ signed, total }: SigningProgressProps) {
  if (total === 0) return null;

  const percentage = (signed / total) * 100;

  return (
    <div className="rounded-lg bg-primary-light/10 p-4">
      <Text variant="body2" className="text-accent-primary">
        Signed {signed} of {total} transactions...
      </Text>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-light/20">
        <div
          className="h-full bg-primary-main transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
