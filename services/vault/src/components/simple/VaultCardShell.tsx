/**
 * Shared shell primitives for vault cards.
 *
 * VaultDetailCard (pending deposit / withdraw sections) and CollateralVaultItem
 * (collateral expanded view) share the same panel chrome and label/value row
 * layout. These primitives keep that layout in one place so the two cards stay
 * visually consistent.
 */

import { useId, type ReactNode } from "react";
import { Tooltip } from "react-tooltip";
import { twJoin } from "tailwind-merge";

interface VaultCardShellProps {
  children: ReactNode;
  /** Optional test id forwarded to the panel element */
  testId?: string;
  /** Visually dim the entire card to communicate that its action is blocked.
   *  Used today for the wallet-ownership-mismatch case; pair with
   *  `disabledTooltip` so hover explains why. */
  disabled?: boolean;
  /** Tooltip shown when hovering a `disabled` card. */
  disabledTooltip?: string;
}

/**
 * Outer panel chrome shared by every vault card.
 *
 * The tooltip is wired via react-tooltip data attributes on the same `<div>`,
 * not via a wrapper component. A wrapper (e.g. `<Hint attachToChildren>`)
 * inserts an inline-flex `<span>` between this card and its parent's vertical
 * layout, breaking alignment with the other cards in the section.
 */
export function VaultCardShell({
  children,
  testId,
  disabled,
  disabledTooltip,
}: VaultCardShellProps) {
  const tooltipId = useId();
  const tooltipActive = Boolean(disabled && disabledTooltip);

  return (
    <div
      data-testid={testId}
      className={twJoin(
        "space-y-3 rounded-lg bg-primary-contrast p-4",
        disabled && "opacity-50",
      )}
      data-tooltip-id={tooltipActive ? tooltipId : undefined}
      data-tooltip-content={tooltipActive ? disabledTooltip : undefined}
    >
      {children}
      {tooltipActive && (
        <Tooltip
          id={tooltipId}
          place="top"
          positionStrategy="fixed"
          openOnClick={false}
        />
      )}
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
