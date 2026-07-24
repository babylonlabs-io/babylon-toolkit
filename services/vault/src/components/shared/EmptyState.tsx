/**
 * EmptyState Component
 *
 * Two presentations, one component:
 * - `v3` (default) — the tab-level empty state shared by Vaults, Loans and
 *   Activity (Figma "Home Screen Cards": 11716:54592, 10044:14068,
 *   10044:13346). Document illustration, filled card, 24px gaps, a
 *   600px-capped centered copy block with a 4px title/body gap, then the CTA.
 * - `compact` — the v2 reserve-detail connect prompt, which predates this
 *   design and must keep its old look: no illustration unless the caller
 *   supplies an avatar, plain card chrome, 14px description.
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { Connect } from "@/components/Wallet";

import { EmptyStateIcon } from "./icons/EmptyStateIcon";

interface EmptyStateProps {
  /** Avatar image URL rendered instead of the default illustration. */
  avatarUrl?: string;
  /** Avatar alt text */
  avatarAlt?: string;
  /** Primary text/title */
  title: string;
  /** Secondary text/description (optional) */
  description?: string;
  /** Presentation — see the file header. */
  variant?: "v3" | "compact";
  /** Whether the user is connected */
  isConnected?: boolean;
  /**
   * Fully custom action node rendered when connected (e.g. the vaults Deposit
   * CTA carrying its E2E testid). Takes precedence over
   * `actionLabel`/`onAction` — consumers pass one or the other. A Connect
   * button is always shown instead while disconnected.
   */
  action?: ReactNode;
  /** Button label when connected (used when `action` is not provided) */
  actionLabel?: string;
  /** Callback when the labeled action button is clicked */
  onAction?: () => void;
  /** Whether to wrap content in a Card component */
  withCard?: boolean;
}

/**
 * Figma pins the v3 CTA at 120px wide; core-ui's `large` button (h-40, px-24,
 * 16px label) is otherwise an exact match. Exported because the vaults tab
 * supplies its own `DepositButton` (it carries an E2E testid) and has to match.
 */
export const ACTION_WIDTH_CLASS = "min-w-[120px]";

export function EmptyState({
  avatarUrl,
  avatarAlt,
  title,
  description,
  variant = "v3",
  isConnected = false,
  action,
  actionLabel,
  onAction,
  withCard = false,
}: EmptyStateProps) {
  const isV3 = variant === "v3";

  const connectedAction =
    action ??
    (actionLabel && onAction && (
      <Button
        // The brand orange CTA is core-ui's `secondary` color
        // (`bg-secondary-main`) — the same the ConnectButton uses.
        // `primary` (`bg-primary-light`) is the blue, not what we want here.
        variant="contained"
        color="secondary"
        size={isV3 ? "large" : "medium"}
        className={isV3 ? ACTION_WIDTH_CLASS : undefined}
        // Invoked with no arguments on purpose: callers pass handlers
        // that take optional parameters (e.g. `openDeposit(amountBtc?)`),
        // and forwarding the click event would land a MouseEvent in that
        // parameter. TypeScript can't catch it — a zero-arg signature is
        // assignable to onClick's.
        onClick={() => onAction()}
      >
        {actionLabel}
      </Button>
    ));

  const avatar = avatarUrl && (
    <Avatar
      url={avatarUrl}
      alt={avatarAlt ?? ""}
      size="xlarge"
      className={isV3 ? "h-[100px] w-[100px]" : "mb-2 h-[100px] w-[100px]"}
    />
  );

  const actionSlot = (!isConnected || connectedAction) && (
    <div className={isV3 ? undefined : "mt-8"}>
      {isConnected ? connectedAction : <Connect />}
    </div>
  );

  const content = isV3 ? (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      {avatar || <EmptyStateIcon />}

      <div className="flex w-full max-w-[600px] flex-col items-center gap-6">
        <div className="flex w-full flex-col gap-1 text-center tracking-[0.15px]">
          <p className="text-xl leading-[1.6] text-accent-primary">{title}</p>
          {description && (
            <p className="text-base leading-[1.5] text-accent-secondary">
              {description}
            </p>
          )}
        </div>

        {actionSlot}
      </div>
    </div>
  ) : (
    <div className="flex w-full flex-col items-center justify-center gap-2 py-16">
      {avatar}
      <p className="text-xl text-accent-primary">{title}</p>
      {description && (
        <p className="text-sm text-accent-secondary">{description}</p>
      )}
      {actionSlot}
    </div>
  );

  if (withCard) {
    // v3 Figma: background/secondary fill, 16px radius, 24/40 padding, no
    // border. `compact` keeps core-ui's default card chrome.
    return (
      <Card
        className={
          isV3 ? "border-0 bg-background-secondary px-6 py-10" : undefined
        }
      >
        {content}
      </Card>
    );
  }

  return content;
}
