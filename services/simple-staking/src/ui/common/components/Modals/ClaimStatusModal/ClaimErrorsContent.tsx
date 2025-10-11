import { Text } from "@babylonlabs-io/core-ui";

import type { ClaimResult } from "./ClaimStatusModal";

export function ClaimErrorsContent({ results }: { results?: ClaimResult[] }) {
  if (!results || results.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {results.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2">
          <Text variant="body1" className="text-accent-primary">
            {r.label}
          </Text>
          <Text variant="body2" className="text-accent-secondary">
            Failed
          </Text>
        </div>
      ))}
    </div>
  );
}
