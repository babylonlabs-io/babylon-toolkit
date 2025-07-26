import { useCallback } from "react";

import { ResponsiveDialog } from "@/components/ResponsiveDialog/ResponsiveDialog";
import { useChainProviders } from "@/context/Chain.context";
import { useInscriptionProvider } from "@/context/Inscriptions.context";
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
  const { toggleShowAgain, toggleLockInscriptions } = useInscriptionProvider();
  const connectors = useChainProviders();
  const walletWidgets = useWalletWidgets(connectors, config, onError);
  const { connect, disconnect } = useWalletConnectors({ persistent, accountStorage: storage, onError });
  const { disconnect: disconnectAll } = useWalletConnect();

  const handleAccepTermsOfService = useCallback(() => {
    displayChains?.();
  }, [displayChains]);

  const handleToggleInscriptions = useCallback(
    (lockInscriptions: boolean, showAgain: boolean) => {
      toggleShowAgain?.(showAgain);
      toggleLockInscriptions?.(lockInscriptions);
      displayChains?.();
    },
    [toggleShowAgain, toggleLockInscriptions, displayChains],
  );

  const handleClose = useCallback(() => {
    close?.();
    if (!confirmed) {
      setTimeout(disconnectAll, ANIMATION_DELAY);
    }
  }, [close, disconnectAll, confirmed]);

  const handleConfirm = useCallback(() => {
    confirm?.();
    close?.();
  }, [confirm]);

  return (
    <ResponsiveDialog className="min-h-[80%]" open={visible} onClose={handleClose}>
      <Screen
        current={screen}
        widgets={walletWidgets}
        className="min-h-0 md:size-[600px]"
        onClose={handleClose}
        onConfirm={handleConfirm}
        onSelectWallet={connect}
        onAccepTermsOfService={handleAccepTermsOfService}
        onToggleInscriptions={handleToggleInscriptions}
        onDisconnectWallet={disconnect}
      />
    </ResponsiveDialog>
  );
}
