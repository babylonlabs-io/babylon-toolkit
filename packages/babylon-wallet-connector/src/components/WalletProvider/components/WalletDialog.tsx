import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useEffect, useRef } from "react";

import { useChainProviders } from "@/context/Chain.context";
import { HashMap } from "@/core/types";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { useWalletConnectors } from "@/hooks/useWalletConnectors";
import { useWalletWidgets } from "@/hooks/useWalletWidgets";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Screen } from "./Screen";

interface WalletDialogProps {
  onError?: (e: Error) => void;
  storage: HashMap;
  config: any;
  persistent: boolean;
}

const ANIMATION_DELAY = 1000;

export function WalletDialog({ persistent, storage, config, onError }: WalletDialogProps) {
  const { visible, screen, confirmed, close, confirm, displayChains } = useWidgetState();
  const connectors = useChainProviders();
  const walletWidgets = useWalletWidgets(connectors, config, onError);
  const { connect } = useWalletConnectors({ persistent, accountStorage: storage, onError });
  const { disconnect: disconnectAll } = useWalletConnect();

  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearDisconnectTimer = useCallback(() => {
    if (disconnectTimerRef.current !== undefined) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    if (visible) {
      clearDisconnectTimer();
    }
  }, [visible, clearDisconnectTimer]);

  useEffect(() => clearDisconnectTimer, [clearDisconnectTimer]);

  const handleClose = useCallback(() => {
    close?.();
    if (!confirmed) {
      clearDisconnectTimer();
      disconnectTimerRef.current = setTimeout(disconnectAll, ANIMATION_DELAY);
    }
  }, [close, disconnectAll, confirmed, clearDisconnectTimer]);

  const handleConfirm = useCallback(() => {
    confirm?.();
    close?.();
  }, [confirm, close]);

  const onBack = screen.type === "WALLETS" ? displayChains : undefined;

  return (
    <FullScreenDialog
      open={visible}
      onClose={handleClose}
      onBack={onBack}
      className="items-center justify-center p-6"
    >
      <div className="mx-auto w-full max-w-[612px]">
        <Screen current={screen} widgets={walletWidgets} onConfirm={handleConfirm} onSelectWallet={connect} />
      </div>
    </FullScreenDialog>
  );
}
