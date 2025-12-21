/**
 * EmptyState Component
 * Generic empty state component for displaying connection prompts
 * or empty data states with customizable content
 */

import { Avatar, Button, Card, SubSection } from "@babylonlabs-io/core-ui";

import { Connect } from "@/components/Wallet";

interface EmptyStateProps {
  /** Avatar image URL */
  avatarUrl: string;
  /** Avatar alt text */
  avatarAlt: string;
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
  title,
  description,
  isConnected = false,
  actionLabel,
  onAction,
  withCard = false,
}: EmptyStateProps) {
  const content = (
    <SubSection className="w-full py-28">
      <div className="flex flex-col items-center justify-center gap-2">
        {/* Avatar/Logo */}
        <Avatar
          url={avatarUrl}
          alt={avatarAlt}
          size="xlarge"
          className="mb-2 h-[100px] w-[100px]"
        />

        {/* Primary Text */}
        <p className="text-[20px] text-accent-primary">{title}</p>

        {/* Secondary Text */}
        {description && (
          <p className="text-[14px] text-accent-secondary">{description}</p>
        )}

        {/* Action Button */}
        <div className="mt-8">
          {isConnected ? (
            actionLabel &&
            onAction && (
              <Button
                variant="contained"
                color="primary"
                size="medium"
                onClick={onAction}
                className="rounded-full !bg-white !text-black hover:!bg-gray-100"
              >
                {actionLabel}
              </Button>
            )
          ) : (
            <Connect />
          )}
        </div>
      </div>
    </SubSection>
  );

  if (withCard) {
    return <Card>{content}</Card>;
  }

  return content;
}
