import { Button, Heading } from "@babylonlabs-io/core-ui";
import { useState, type PropsWithChildren } from "react";

import { COPY } from "@/copy";
import { useBtcAction } from "@/hooks/useBtcAction";

export function BtcActionGate({
  children,
  onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
  const { connected, requireBtcWallet } = useBtcAction();
  const [started, setStarted] = useState(connected);

  // Keep an active flow mounted during a temporary wallet disconnect.
  if (started) return <>{children}</>;

  return (
    <div className="mx-auto flex max-w-[564px] flex-col gap-4">
      <Heading variant="h5">{COPY.wallet.btcAction.heading}</Heading>
      <p className="text-accent-secondary">{COPY.wallet.btcAction.body}</p>
      <Button
        onClick={() => {
          if (requireBtcWallet()) setStarted(true);
        }}
      >
        {connected
          ? COPY.wallet.btcAction.retry
          : COPY.wallet.btcAction.connect}
      </Button>
      <Button variant="outlined" onClick={onClose}>
        {COPY.wallet.btcAction.cancel}
      </Button>
    </div>
  );
}
