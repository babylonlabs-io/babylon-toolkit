/**
 * EmptyState Component
 * Generic empty state component for displaying connection prompts
 * or empty data states with customizable content
 */

import { Avatar, Card, SubSection } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { Connect } from "@/components/Wallet";

interface EmptyStateProps {
  /** Avatar image URL (ignored when an illustration is provided) */
  avatarUrl?: string;
  /** Avatar alt text */
  avatarAlt?: string;
  /** Custom illustration rendered in place of the avatar */
  illustration?: ReactNode;
  /** Primary text/title */
  title: string;
  /** Secondary text/description (optional) */
  description?: string;
  /** Whether the user is connected */
  isConnected?: boolean;
  /** Action rendered when connected (a Connect button is shown when disconnected) */
  action?: ReactNode;
  /** Whether to wrap content in a Card component */
  withCard?: boolean;
}

export function EmptyState({
  avatarUrl,
  avatarAlt,
  illustration,
  title,
  description,
  isConnected = false,
  action,
  withCard = false,
}: EmptyStateProps) {
  const content = (
    <SubSection className="w-full py-28">
      <div className="flex flex-col items-center justify-center gap-2">
        {illustration ??
          (avatarUrl && (
            <Avatar
              url={avatarUrl}
              alt={avatarAlt ?? ""}
              size="xlarge"
              className="mb-2 h-[100px] w-[100px]"
            />
          ))}

        {/* Primary Text */}
        <p className="text-xl text-accent-primary">{title}</p>

        {/* Secondary Text */}
        {description && (
          <p className="max-w-[600px] text-center text-base text-accent-secondary">
            {description}
          </p>
        )}

        {/* Action */}
        {(!isConnected || action) && (
          <div className="mt-8">{isConnected ? action : <Connect />}</div>
        )}
      </div>
    </SubSection>
  );

  if (withCard) {
    return <Card>{content}</Card>;
  }

  return content;
}
