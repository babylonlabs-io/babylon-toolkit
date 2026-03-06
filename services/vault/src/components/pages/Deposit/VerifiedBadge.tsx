import { CheckIcon } from "@babylonlabs-io/core-ui";

export function VerifiedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckIcon size={10} variant="success" />
      Verified
    </span>
  );
}
