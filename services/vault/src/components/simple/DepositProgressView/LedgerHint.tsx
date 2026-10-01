import { Text } from "@babylonlabs-io/core-ui";

/** A Ledger hint line under the active step, styled like the WOTS approval hint. */
export function LedgerHint({ children }: { children: string }) {
  return (
    <Text as="p" variant="body2" className="mt-3 text-accent-secondary">
      {children}
    </Text>
  );
}
