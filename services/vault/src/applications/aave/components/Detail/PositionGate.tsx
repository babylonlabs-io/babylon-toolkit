/**
 * PositionGate
 *
 * Renders the audit-#311 fail-closed gate above the LoanCard:
 * - positionError → hard-block + Retry button
 * - ancillaryError → soft-warn banner + render children
 * - neither → render children
 */

import { Button, Text } from "@babylonlabs-io/core-ui";
import { useState, type ReactNode } from "react";

import { COPY } from "@/copy";
import { logger } from "@/infrastructure";

export interface PositionGateProps {
  positionError: Error | null;
  ancillaryError: Error | null;
  refetchPosition: () => Promise<unknown>;
  children: ReactNode;
}

export function PositionGate({
  positionError,
  ancillaryError,
  refetchPosition,
  children,
}: PositionGateProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  if (positionError) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Text variant="body2" className="text-center text-warning-main">
          {COPY.loans.detail.positionLoadError}
        </Text>
        <Button
          disabled={isRetrying}
          onClick={async () => {
            setIsRetrying(true);
            try {
              await refetchPosition();
            } catch (error) {
              logger.warn("Could not reload the Aave position", {
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

  return (
    <>
      {ancillaryError ? (
        <Text variant="body2" className="text-center text-warning-main">
          {COPY.loans.detail.ancillaryLoadWarning}
        </Text>
      ) : null}
      {children}
    </>
  );
}
