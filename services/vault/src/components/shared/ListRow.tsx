/**
 * Shared row primitives for the v3 list surfaces (Active Vaults, Active
 * Loans). Both pages render the same row: a bordered 8px-radius card with a
 * leading asset block, fixed-width label/value metrics, and trailing action
 * buttons. Keeping the chrome here stops the two lists drifting apart.
 *
 * Not a core-ui component: the pattern is vault-app specific and core-ui has
 * no card variant with this border/background pair.
 */

import type { ReactNode } from "react";

/** Bordered row card shared by the vault and loan lists. */
export function ListRowCard({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4 dark:bg-[#202020]"
    >
      {children}
    </div>
  );
}

/** Label over value, on the fixed column width the rows align to. */
export function ListRowMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    // Flexes rather than pinning the design's 190px: at the app's container
    // width three fixed columns plus the asset block and two action buttons
    // overflow, wrapping the buttons onto a second line.
    <div className="flex min-w-[120px] flex-1 flex-col">
      <span className="text-xs leading-[1.4] tracking-[0.4px] text-accent-secondary">
        {label}
      </span>
      <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
        {value}
      </span>
    </div>
  );
}
