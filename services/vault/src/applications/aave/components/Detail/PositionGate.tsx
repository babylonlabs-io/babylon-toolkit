/**
 * PositionGate
 *
 * Renders the audit-#311 fail-closed gate above the LoanCard:
 * - positionError → hard-block + Retry button
 * - ancillaryError → soft-warn banner + render children
 * - neither → render children
 */

import { Button, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

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
      <div className="flex flex-col items-center gap-3">
        <Text variant="body2" className="text-center text-warning-main">
          Couldn&apos;t load your position. Please try again.
        </Text>
        <Button onClick={() => void refetchPosition()}>Retry</Button>
      </div>
    );
  }

  return (
    <>
      {ancillaryError ? (
        <Text variant="body2" className="text-center text-warning-main">
          Some data couldn&apos;t be loaded. Borrow may be unavailable; repay
          still works from your loaded debt.
        </Text>
      ) : null}
      {children}
    </>
  );
}
