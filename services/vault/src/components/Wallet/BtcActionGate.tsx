import { Button, Heading, Loader } from "@babylonlabs-io/core-ui";
import { useState, type PropsWithChildren } from "react";

import { COPY } from "@/copy";
import { useBtcAction } from "@/hooks/useBtcAction";

export function BtcActionGate({
  children,
  onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
  const {
    connected,
    btcConnected,
    sessionConfirmed,
    loading,
    requireBtcWallet,
  } = useBtcAction();
  const [started, setStarted] = useState(connected);

  // Keep an active flow mounted during a temporary wallet disconnect.
  if (started) return <>{children}</>;

  // A saved session is still restoring, so neither prompt is right yet. The
  // children stay unmounted: every resume branch auto-runs on mount.
  if (loading) {
    return (
      <div className="mx-auto flex max-w-[564px] flex-col items-center gap-4">
        <Loader />
        <p className="text-accent-secondary">
          {COPY.wallet.btcAction.resolving}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[564px] flex-col gap-4">
      <Heading variant="h5">{COPY.wallet.btcAction.heading}</Heading>
      <p className="text-accent-secondary">
        {btcConnected && !sessionConfirmed
          ? COPY.wallet.btcAction.confirmBody
          : COPY.wallet.btcAction.body}
      </p>
      {/* These data-testids exist so the real-wallet E2E
          (e2e/real/actions/stepMachine.ts) can disambiguate these controls
          from the progress view's Retry, which shares this gate's "Retry"
          label. Carry them over if you move or rename the controls. */}
      <Button
        data-testid={connected ? "btc-action-retry" : "btc-action-connect"}
        onClick={() => {
          if (requireBtcWallet()) setStarted(true);
        }}
      >
        {connected
          ? COPY.wallet.btcAction.retry
          : COPY.wallet.btcAction.connect}
      </Button>
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
