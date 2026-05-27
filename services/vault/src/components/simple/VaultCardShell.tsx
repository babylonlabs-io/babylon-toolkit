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
  /**
   * Optional handler invoked when the card body is clicked. Clicks on
   * interactive descendants (buttons, links) are excluded so per-row
   * actions like Copy / explorer / "Submit WOTS Key" still work as before.
   * Ignored while `disabled` is true.
   */
  onClick?: () => void;
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
  onClick,
}: VaultCardShellProps) {
  const tooltipId = useId();
  const tooltipActive = Boolean(disabled && disabledTooltip);
  // A `disabled` card (e.g. wallet-ownership mismatch) is still clickable —
  // opening the multistepper as a read-only view lets the user see where the
  // deposit is even when they can't currently act on it. The dim + tooltip
  // already communicate that actions are blocked.
  const clickable = Boolean(onClick);

  // Clicks on buttons or anchors inside the card (Copy / explorer link /
  // action button) should preserve their own behaviour, not open the card
  // multistepper. `closest` walks up from the click target so a click on
  // the inner SVG of a copy button still resolves to its button parent.
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!clickable) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a")) return;
    onClick?.();
  };

  return (
    <div
      data-testid={testId}
      className={twJoin(
        "space-y-3 rounded-lg bg-primary-contrast p-4 transition-colors",
        disabled && "opacity-50",
        // Direct hover on a clickable card (single pending deposit / expired
        // card) gives the slightest blue tint.
        clickable && "cursor-pointer hover:bg-primary-light/5",
        // Group-hover handles the batched-pegin case: when the outer
        // BatchedDepositGroup wrapper is hovered, every sub-card lights up
        // at the same time so the whole stack reads as a single button.
        // No-op when the card isn't inside a `group` ancestor.
        "group-hover:bg-primary-light/5",
      )}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
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
