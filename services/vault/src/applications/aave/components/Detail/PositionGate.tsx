/**
 * PositionGate
 *
 * Renders the audit-#311 fail-closed gate above the LoanCard:
 * - positionError → hard-block + Retry button
 * - ancillaryError → soft-warn banner + render children
 * - neither → render children
 */

import { Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { COPY } from "@/copy";

import { LoadErrorRetry } from "./LoadErrorRetry";

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
  if (positionError) {
    return (
      <LoadErrorRetry
        message={COPY.loans.detail.positionLoadError}
        onRetry={refetchPosition}
        retryFailureLog="Could not reload the Aave position"
      />
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
