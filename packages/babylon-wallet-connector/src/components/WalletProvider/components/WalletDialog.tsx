import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

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
  /** Optional content rendered top-right, mirroring the close/back button (e.g. a settings trigger). */
  actions?: ReactNode;
  /** Overrides the default `left-4` position of the close/back button. */
  closeButtonClassName?: string;
  /** Overrides the default `right-4` position of the `actions` slot. */
  actionsClassName?: string;
}

const ANIMATION_DELAY = 1000;

export function WalletDialog({
  persistent,
  storage,
  config,
  onError,
  actions,
  closeButtonClassName,
  actionsClassName,
}: WalletDialogProps) {
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
      actions={actions}
      closeButtonClassName={closeButtonClassName}
      actionsClassName={actionsClassName}
    >
      <div className="mx-auto w-full max-w-[612px]">
        <Screen current={screen} widgets={walletWidgets} onConfirm={handleConfirm} onSelectWallet={connect} />
      </div>
    </FullScreenDialog>
  );
}
