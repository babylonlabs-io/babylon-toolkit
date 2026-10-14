import { Button, Heading, Loader } from "@babylonlabs-io/core-ui";
import { useState, type PropsWithChildren } from "react";

import { DEPOSIT_CONTENT_MAX_WIDTH_CLASS } from "@/components/simple/DepositProgressView/layout";
import { COPY } from "@/copy";
import { useBtcAction } from "@/hooks/useBtcAction";

/** Names the operation on the card a ready wallet sees before it starts. */
interface BtcActionStartCopy {
  heading: string;
  body: string;
  button: string;
}

// Mounts the wallet flow only on autoStart or a click; with `start`, that click
// is on a card naming the operation, so no wallet prompt opens unannounced.
export function BtcActionGate({
  children,
  onClose,
  ready = true,
  autoStart = true,
  start,
}: PropsWithChildren<{
  onClose: () => void;
  ready?: boolean;
  autoStart?: boolean;
  start?: BtcActionStartCopy;
}>) {
  const {
    connected,
    btcConnected,
    sessionConfirmed,
    loading,
    locked,
    isUnlocking,
    requireBtcWallet,
  } = useBtcAction();
  const [admitted, setAdmitted] = useState(connected && autoStart);
  const [started, setStarted] = useState(connected && ready && autoStart);
  // A locked wallet keeps its admission so the flow resumes after the unlock.
  if (admitted && ((!connected && !locked) || !autoStart)) setAdmitted(false);
  if (!started && admitted && connected && autoStart && ready) setStarted(true);

  // Keep the active flow and its Cancel control mounted after wallet loss.
  if (started) return <>{children}</>;

  return (
    <div
      className={`mx-auto flex flex-col gap-4 ${DEPOSIT_CONTENT_MAX_WIDTH_CLASS}`}
    >
      {loading || (connected && !ready) ? (
        <>
          <Loader />
          <p className="text-accent-secondary">
            {COPY.wallet.btcAction.resolving}
          </p>
        </>
      ) : btcConnected && locked ? (
        <>
          <Heading variant="h5">{COPY.wallet.locked.title}</Heading>
          <p className="text-accent-secondary">
            {COPY.wallet.locked.description}
          </p>
          <Button
            data-testid="btc-action-unlock"
            disabled={isUnlocking}
            onClick={() => {
              if (autoStart) setAdmitted(true);
              requireBtcWallet();
            }}
          >
            {isUnlocking
              ? COPY.wallet.locked.unlocking
              : COPY.wallet.locked.unlockButton}
          </Button>
        </>
      ) : connected && start ? (
        <>
          <Heading variant="h5">{start.heading}</Heading>
          <p className="text-accent-secondary">{start.body}</p>
          {/* data-testid is a real-wallet E2E hook (e2e/real/actions/stepMachine.ts). */}
          <Button
            data-testid="btc-action-start"
            onClick={() => {
              if (requireBtcWallet() && ready) setStarted(true);
            }}
          >
            {start.button}
          </Button>
        </>
      ) : (
        <>
          <Heading variant="h5">{COPY.wallet.btcAction.heading}</Heading>
          <p className="text-accent-secondary">
            {btcConnected && !sessionConfirmed
              ? COPY.wallet.btcAction.confirmBody
              : COPY.wallet.btcAction.body}
          </p>
          {/* Keep these IDs distinct from the progress view's Retry control. */}
          <Button
            data-testid={connected ? "btc-action-retry" : "btc-action-connect"}
            onClick={() => {
              if (requireBtcWallet() && ready) setStarted(true);
            }}
          >
            {connected
              ? COPY.wallet.btcAction.retry
              : COPY.wallet.btcAction.connect}
          </Button>
        </>
      )}
      <Button
        data-testid="btc-action-cancel"
        variant="outlined"
        onClick={onClose}
      >
        {COPY.wallet.btcAction.cancel}
      </Button>
    </div>
  );
}
