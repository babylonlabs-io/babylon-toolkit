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

import { COPY } from "@/copy";

import { isInteractiveEventTarget } from "./cardInteraction";

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
  // A `disabled` card (wallet-ownership mismatch) is inert: it isn't yours, and
  // opening the multistepper would auto-fire an action signed by the wrong
  // wallet that can only fail its on-chain checks. Block the click entirely; the
  // dim + tooltip already say "switch to the owning wallet."
  const clickable = Boolean(onClick) && !disabled;

  // Clicks/keys on buttons or anchors inside the card (Copy / explorer link /
  // action button) preserve their own behaviour rather than open the card
  // multistepper — see `isInteractiveEventTarget`.
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!clickable || isInteractiveEventTarget(event)) return;
    onClick?.();
  };

  // Keyboard activation must apply the same inner-control guard as the click
  // handler. Without it, Enter/Space on a focused Copy button or explorer link
  // would both fire that control and open the multistepper — and the
  // preventDefault would cancel the link's own navigation.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || isInteractiveEventTarget(event)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
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
      // a11y status: keyboard activation is handled (Enter/Space via
      // handleKeyDown, with the same inner-control guard as click). KNOWN,
      // ACCEPTED TRADEOFF: this `role="button"` wrapper still contains real
      // buttons/links (nested-interactive ARIA), which a strict validator
      // flags — accepted for the temporary "whole card is the action surface"
      // design. Proper fix is a visually-hidden stretched-link button so the
      // wrapper drops role="button"; tracked as a follow-up.
      role={clickable ? "button" : undefined}
      aria-label={clickable ? COPY.deposit.progress.openDetailsAria : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
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
