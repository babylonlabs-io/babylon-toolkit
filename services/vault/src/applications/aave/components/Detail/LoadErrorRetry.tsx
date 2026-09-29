/**
 * LoadErrorRetry
 *
 * A hard block for a read the step cannot go on without: what failed, and a
 * Retry that re-runs the read.
 */

import { Button, Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { COPY } from "@/copy";
import { logger } from "@/infrastructure";

interface LoadErrorRetryProps {
  message: string;
  onRetry: () => Promise<unknown>;
  /** Logged when the retry itself fails. */
  retryFailureLog: string;
}

export function LoadErrorRetry({
  message,
  onRetry,
  retryFailureLog,
}: LoadErrorRetryProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3">
      <Text variant="body2" className="text-center text-warning-main">
        {message}
      </Text>
      <Button
        disabled={isRetrying}
        onClick={async () => {
          setIsRetrying(true);
          try {
            await onRetry();
          } catch (error) {
            logger.warn(retryFailureLog, {
              error: error instanceof Error ? error : String(error),
            });
          } finally {
            setIsRetrying(false);
          }
        }}
      >
        {COPY.loans.detail.retry}
      </Button>
    </div>
  );
}
