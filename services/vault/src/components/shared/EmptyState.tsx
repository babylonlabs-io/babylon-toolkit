/**
 * EmptyState Component
 * Generic empty state component for displaying connection prompts
 * or empty data states with customizable content
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { Connect } from "@/components/Wallet";

interface EmptyStateProps {
  /** Avatar image URL. Ignored when `icon` is provided. */
  avatarUrl?: string;
  /** Avatar alt text */
  avatarAlt?: string;
  /** Custom illustration rendered instead of the circular avatar (e.g. a line
   *  icon from the v3 designs). Takes precedence over `avatarUrl`. */
  icon?: ReactNode;
  /** Primary text/title */
  title: string;
  /** Secondary text/description (optional) */
  description?: string;
  /** Whether the user is connected */
  isConnected?: boolean;
  /** Button label when connected (if not provided, no button is shown when connected) */
  actionLabel?: string;
  /** Callback when action button is clicked */
  onAction?: () => void;
  /** Whether to wrap content in a Card component */
  withCard?: boolean;
}

export function EmptyState({
  avatarUrl,
  avatarAlt,
  icon,
  title,
  description,
  isConnected = false,
  actionLabel,
  onAction,
  withCard = false,
}: EmptyStateProps) {
  // A single centered surface. When `withCard` is set, the `Card` below is the
  // only surface — the content sits directly on it (no inner panel), matching
  // the v3 empty-state design.
  const content = (
    <div className="flex w-full flex-col items-center justify-center gap-2 py-16">
      {/* Illustration: custom icon node when provided, else the avatar image */}
      {icon ? (
        <div className="mb-2">{icon}</div>
      ) : (
        <Avatar
          url={avatarUrl}
          alt={avatarAlt}
          size="xlarge"
          className="mb-2 h-[100px] w-[100px]"
        />
      )}

      {/* Primary Text */}
      <p className="text-xl text-accent-primary">{title}</p>

      {/* Secondary Text */}
      {description && (
        <p className="text-sm text-accent-secondary">{description}</p>
      )}

      {/* Action Button */}
      <div className="mt-8">
        {isConnected ? (
          actionLabel &&
          onAction && (
            <Button
              // The brand orange CTA is core-ui's `secondary` color
              // (`bg-secondary-main`) — the same the ConnectButton uses.
              // `primary` (`bg-primary-light`) is the blue, not what we want here.
              variant="contained"
              color="secondary"
              size="medium"
              // Invoked with no arguments on purpose: callers pass handlers
              // that take optional parameters (e.g. `openDeposit(amountBtc?)`),
              // and forwarding the click event would land a MouseEvent in that
              // parameter. TypeScript can't catch it — a zero-arg signature is
              // assignable to onClick's.
              onClick={() => onAction()}
            >
              {actionLabel}
            </Button>
          )
        ) : (
          <Connect />
        )}
      </div>
    </div>
  );

  if (withCard) {
    return <Card>{content}</Card>;
  }

  return content;
}
