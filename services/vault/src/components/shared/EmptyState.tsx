/**
 * EmptyState Component
 * The single v3 empty-state surface (Figma "Home Screen Cards" —
 * 11716:54592 vaults, 10044:14068 loans, 10044:13346 activity). All three
 * frames are the same spec: document illustration, 24px gap, a 600px-capped
 * centered copy block with a 4px title/body gap, then the CTA.
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
 * Figma pins the CTA at 120px wide; core-ui's `large` button (h-40, px-24,
 * 16px label) is otherwise an exact match.
 */
const ACTION_WIDTH_CLASS = "min-w-[120px]";

export function EmptyState({
  avatarUrl,
  avatarAlt,
  title,
  description,
  isConnected = false,
  action,
  actionLabel,
  onAction,
  withCard = false,
}: EmptyStateProps) {
  const connectedAction =
    action ??
    (actionLabel && onAction && (
      <Button
        // The brand orange CTA is core-ui's `secondary` color
        // (`bg-secondary-main`) — the same the ConnectButton uses.
        // `primary` (`bg-primary-light`) is the blue, not what we want here.
        variant="contained"
        color="secondary"
        size="large"
        className={ACTION_WIDTH_CLASS}
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

  // A single centered surface. When `withCard` is set, the `Card` below is the
  // only surface — the content sits directly on it (no inner panel).
  const content = (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      {avatarUrl ? (
        <Avatar
          url={avatarUrl}
          alt={avatarAlt ?? ""}
          size="xlarge"
          className="h-[100px] w-[100px]"
        />
      ) : (
        <EmptyStateIcon />
      )}

      <div className="flex w-full max-w-[600px] flex-col items-center gap-6">
        <div className="flex w-full flex-col gap-1 text-center tracking-[0.15px]">
          <p className="text-xl leading-[1.6] text-accent-primary">{title}</p>
          {description && (
            <p className="text-base leading-[1.5] text-accent-secondary">
              {description}
            </p>
          )}
        </div>

        {(!isConnected || connectedAction) && (
          <div>{isConnected ? connectedAction : <Connect />}</div>
        )}
      </div>
    </div>
  );

  if (withCard) {
    // Figma: background/secondary fill, 16px radius, 24/40 padding, no border.
    return (
      <Card className="border-0 bg-background-secondary px-6 py-10">
        {content}
      </Card>
    );
  }

  return content;
}
