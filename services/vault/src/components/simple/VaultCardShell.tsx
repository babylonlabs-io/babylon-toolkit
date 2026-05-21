/**
 * Shared shell primitives for vault cards.
 *
 * VaultDetailCard (pending deposit / withdraw sections) and CollateralVaultItem
 * (collateral expanded view) share the same panel chrome and label/value row
 * layout. These primitives keep that layout in one place so the two cards stay
 * visually consistent.
 */

import type { ReactNode } from "react";

interface VaultCardShellProps {
  children: ReactNode;
  /** Optional test id forwarded to the panel element */
  testId?: string;
}

/** Outer panel chrome shared by every vault card. */
export function VaultCardShell({ children, testId }: VaultCardShellProps) {
  return (
    <div
      data-testid={testId}
      className="space-y-3 rounded-lg bg-primary-contrast p-4"
    >
      {children}
    </div>
  );
}

interface VaultCardRowProps {
  /** Label shown on the left */
  label: string;
  /** Value content shown on the right */
  children: ReactNode;
}

/** A single label/value row inside a vault card. */
export function VaultCardRow({ label, children }: VaultCardRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-accent-secondary">{label}</span>
      {children}
    </div>
  );
}
