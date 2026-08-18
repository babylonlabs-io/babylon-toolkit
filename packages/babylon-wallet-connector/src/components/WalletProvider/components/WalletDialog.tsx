import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useRef, type ReactNode } from "react";

import { useChainProviders } from "@/context/Chain.context";
import { useLifeCycleHooks, type WalletLifecycleConnection } from "@/context/LifecycleHooks.context";
import { createConfirmationReceipt, WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { ChainId, HashMap, IWallet } from "@/core/types";
import { useWalletConnectors } from "@/hooks/useWalletConnectors";
import { useWalletWidgets } from "@/hooks/useWalletWidgets";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Screen } from "./Screen";

/**
 * Picks the identity the terms-of-service hook is called with. Required chains
 * are walked in the host's declared order — iterating `selectedWallets` instead
 * would key the identity off whichever wallet the user happened to connect first.
 */
function findPrimaryConnection(
  connections: WalletLifecycleConnection[],
  requiredChainIds: string[],
): WalletLifecycleConnection | undefined {
  for (const chainId of requiredChainIds) {
    const match = connections.find(({ chain }) => chain === chainId);
    if (match) return match;
  }

  return connections[0];
}

function collectConnections(
  selectedWallets: Record<string, IWallet | undefined>,
): WalletLifecycleConnection[] {
  return Object.entries(selectedWallets).flatMap<WalletLifecycleConnection>(([chain, wallet]) =>
    wallet?.account ? [{ chain: chain as ChainId, wallet, account: wallet.account }] : [],
  );
}

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

export function WalletDialog({
  persistent,
  storage,
  config,
  onError,
  actions,
  closeButtonClassName,
  actionsClassName,
}: WalletDialogProps) {
  const { visible, screen, confirmed, selectedWallets, requiredChainIds, close, confirm, displayChains, displayError } =
    useWidgetState();
  const { acceptTermsOfService, onConfirm } = useLifeCycleHooks();
  const connectors = useChainProviders();
  const walletWidgets = useWalletWidgets(connectors, config, onError);
  const { connect } = useWalletConnectors({ persistent, accountStorage: storage, onError });

  // Read inside `handleConfirm` after awaiting the host's hooks, so the
  // confirmation reflects the connections as they stand then.
  const selectedWalletsRef = useRef(selectedWallets);
  selectedWalletsRef.current = selectedWallets;

  // Closing without confirming leaves the connectors connected, so the user can
  // reopen and finish where they left off. The receipt written on confirm is
  // the single gate that lets a later reload auto-confirm — no receipt, no
  // silent restore — so leaving the connection up grants nothing on its own.
  const handleClose = useCallback(() => {
    close?.();
  }, [close]);

  const handleConfirm = useCallback(async () => {
    try {
      if (!confirmed) {
        const connections = collectConnections(selectedWallets);

        // A required chain whose wallet is selected but has no account would
        // otherwise drop silently out of `connections` and be confirmed with
        // nothing recorded for it, leaving the next reload to ask again with no
        // signal that anything went wrong.
        const uncovered = requiredChainIds.filter((chainId) => !connections.some(({ chain }) => chain === chainId));
        if (uncovered.length > 0) {
          throw new Error(`No connected account for required chain${uncovered.length > 1 ? "s" : ""}: ${uncovered.join(", ")}`);
        }

        const primary = findPrimaryConnection(connections, requiredChainIds);

        if (primary) {
          await acceptTermsOfService?.({
            address: primary.account.address,
            public_key: primary.account.publicKeyHex,
            chain: primary.chain,
            connections,
          });
        }
        await onConfirm?.(connections);

        // The host's hooks are awaited, and a required wallet can disconnect
        // while they run. Re-read the live selection rather than confirming
        // against the snapshot taken before the await, which would recreate an
        // approval for a wallet that is no longer there.
        const settled = collectConnections(selectedWalletsRef.current);
        const lost = requiredChainIds.filter((chainId) => !settled.some(({ chain }) => chain === chainId));
        if (lost.length > 0) {
          throw new Error(`Wallet disconnected while confirming: ${lost.join(", ")}`);
        }

        if (persistent) {
          storage.set(WALLET_CONFIRMATION_RECEIPT_KEY, createConfirmationReceipt(settled, connectors));
        }
      }

      confirm?.();
      close?.();
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Wallet confirmation failed");
      onError?.(normalizedError);
      displayError?.({
        title: "Connection Failed",
        description: normalizedError.message,
        submitButton: "",
        cancelButton: "Done",
        onCancel: displayChains,
      });
    }
  }, [
    acceptTermsOfService,
    close,
    confirm,
    confirmed,
    connectors,
    displayChains,
    displayError,
    onConfirm,
    onError,
    persistent,
    requiredChainIds,
    selectedWallets,
    storage,
  ]);

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
