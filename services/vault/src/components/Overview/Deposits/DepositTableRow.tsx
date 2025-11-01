/**
 * DepositTableRow Component
 *
 * Wrapper component for each deposit table row.
 * Enables using hooks (useDepositRowPolling) at row level without violating React rules.
 *
 * This component:
 * - Polls for payout transactions independently per row
 * - Determines button state via state machine
 * - Renders action button when signing is ready
 */

import { Button } from "@babylonlabs-io/core-ui";

import type { PendingPeginRequest } from "../../../storage/peginStorage";
import type { VaultActivity } from "../../../types/activity";
import type { Deposit } from "../../../types/vault";

import { useDepositRowPolling } from "./hooks/useDepositRowPolling";

interface DepositTableRowData {
  /** Deposit data for table display */
  deposit: Deposit;
  /** Full activity data for polling */
  activity: VaultActivity;
  /** BTC public key for polling */
  btcPublicKey?: string;
  /** Pending pegin from localStorage */
  pendingPegin?: PendingPeginRequest;
  /** Callback when sign button clicked - passes transactions */
  onSignClick: (depositId: string, transactions: any[]) => void;
}

/**
 * Renders action buttons for a deposit row
 *
 * Uses row-level polling to determine button state from state machine.
 * This component can be used in the Table's render function.
 */
export function DepositTableRowActions({
  deposit,
  activity,
  btcPublicKey,
  pendingPegin,
  onSignClick,
}: DepositTableRowData) {
  // Poll for payout transactions at row level
  const { shouldShowSignButton, loading, transactions } = useDepositRowPolling({
    activity,
    btcPublicKey,
    pendingPegin,
  });

  // Don't show button if no action available
  if (!shouldShowSignButton) {
    return null;
  }

  return (
    <Button
      size="small"
      variant="contained"
      onClick={() => onSignClick(deposit.id, transactions || [])}
      disabled={loading || !transactions}
    >
      {loading ? "Loading..." : "Sign"}
    </Button>
  );
}
