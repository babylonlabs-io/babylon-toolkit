import { Button, Heading, Loader } from "@babylonlabs-io/core-ui";
import { useState, type PropsWithChildren } from "react";

import { DEPOSIT_CONTENT_MAX_WIDTH_CLASS } from "@/components/simple/DepositProgressView/layout";
import { COPY } from "@/copy";
import { useBtcAction } from "@/hooks/useBtcAction";

export function BtcActionGate({
  children,
  onClose,
  ready = true,
  autoStart = true,
}: PropsWithChildren<{
  onClose: () => void;
  ready?: boolean;
  autoStart?: boolean;
}>) {
  const {
    connected,
    btcConnected,
    sessionConfirmed,
    loading,
    requireBtcWallet,
  } = useBtcAction();
  const [admitted, setAdmitted] = useState(connected && autoStart);
  const [started, setStarted] = useState(connected && ready && autoStart);
  if (admitted && (!connected || !autoStart)) setAdmitted(false);
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
