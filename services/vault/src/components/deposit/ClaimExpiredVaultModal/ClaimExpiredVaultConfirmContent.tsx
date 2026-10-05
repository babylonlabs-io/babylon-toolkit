import {
  Button,
  Callout,
  Heading,
  Loader,
  Text,
} from "@babylonlabs-io/core-ui";

import { isActivateAndRedeemBlocked } from "@/components/shared/protocolStatus";
import { DeviceAppWaitDetail } from "@/components/simple/DepositProgressView/DeviceAppWaitDetail";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import type { ClaimExpiredWindow } from "@/models/peginStateMachine";
import type { LedgerDeviceStep } from "@/types/ledgerDeviceStep";
import { formatClaimWindowRemaining } from "@/utils/claimExpiredWindow";

interface ClaimExpiredVaultConfirmContentProps {
  /**
   * The grace window as last read on chain, or `undefined` when unknown. It
   * can change while the screen is open: a window that closes, or a redeem
   * that lands elsewhere, disables confirm before any wallet prompt.
   */
  claimWindow: ClaimExpiredWindow | undefined;
  /** Secret derivation or the redeem transaction in flight. */
  claiming: boolean;
  error: string | null;
  /** The vault's on-chain state rules the redeem out — confirm stays disabled. */
  errorTerminal: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * The Ledger device step the modal is showing, or `null` for every other
   * wallet and state — same contract as the withdraw modal's.
   */
  ledgerStep?: LedgerDeviceStep | null;
}

/**
 * Confirmation content of the redeem modal: what redeeming does, how long the
 * grace window has left, and the confirm button — disabled while the protocol
 * scope is paused, the one governance state that blocks `claimExpiredVault`.
 */
export function ClaimExpiredVaultConfirmContent({
  claimWindow,
  claiming,
  error,
  errorTerminal,
  onConfirm,
  onCancel,
  ledgerStep = null,
}: ClaimExpiredVaultConfirmContentProps) {
  const gate = useProtocolGateState();
  const paused = isActivateAndRedeemBlocked(gate);
  // The chain already rules the redeem out. Confirm stays disabled so the
  // depositor is not asked to derive a secret the submission would refuse.
  const ruledOut =
    claimWindow?.state === "closed" || claimWindow?.state === "redeemed";
  const canClaim = !claiming && !errorTerminal && !paused && !ruledOut;

  const copy = COPY.deposit.claimExpired;
  const windowNotice = (() => {
    switch (claimWindow?.state) {
      case "open":
        return copy.deadline(
          formatClaimWindowRemaining(claimWindow.blocksRemaining),
        );
      case "closed":
        return copy.windowClosedNotice;
      case "redeemed":
        return copy.errors.alreadyRedeemed;
      default:
        return copy.deadlineUnknown;
    }
  })();

  return (
    <div className="mx-auto flex w-full max-w-[564px] flex-col gap-10 rounded-3xl border border-secondary-strokeLight bg-surface px-6 pb-6 pt-10 dark:border-secondary-strokeDark">
      <div className="flex flex-col items-center gap-6">
        <svg
          width="90"
          height="90"
          viewBox="0 0 90 90"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-accent-primary"
          aria-hidden="true"
        >
          <path
            d="M11.25 15.4793L45.0161 5.625L78.75 15.4793V35.6882C78.75 56.9291 65.1566 75.7864 45.0049 82.5009C24.8477 75.7866 11.25 56.925 11.25 35.6788V15.4793Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <Heading variant="h5" className="text-accent-primary">
            {copy.title}
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            {copy.body}
          </Text>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Callout variant="warning">{windowNotice}</Callout>
        {/* The confirm button gates on the pause, but nothing else says why —
            and the window keeps running while paused, so the depositor needs
            to know to come back. */}
        {paused && (
          <Callout variant="warning">{COPY.pegin.claimExpiredPaused}</Callout>
        )}
        {error && <Callout variant="error">{error}</Callout>}
        {ledgerStep?.kind === "awaiting-app" && (
          <DeviceAppWaitDetail appName={ledgerStep.appName} />
        )}
        {ledgerStep?.kind === "awaiting-continue" && (
          <Callout variant="info">
            {COPY.deposit.ledger.activationPause.hint}
          </Callout>
        )}
        <div className="flex w-full gap-4">
          <Button
            variant="outlined"
            color="primary"
            className="flex-1 whitespace-nowrap !border-secondary-strokeLight"
            onClick={onCancel}
            disabled={claiming && ledgerStep?.kind !== "awaiting-app"}
          >
            {copy.cancelButton}
          </Button>
          <Button
            variant="contained"
            color="secondary"
            className="flex-1 whitespace-nowrap"
            onClick={onConfirm}
            disabled={!canClaim}
          >
            {claiming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={16} className="text-accent-contrast" />
                <span>{COPY.common.confirming}</span>
              </span>
            ) : ledgerStep?.kind === "awaiting-continue" ? (
              COPY.deposit.ledger.activationPause.continue
            ) : ledgerStep?.kind === "reconnect-required" ? (
              COPY.deposit.ledger.reconnectButton
            ) : error && !errorTerminal ? (
              copy.retryButton
            ) : (
              copy.confirmButton
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
