import { useCallback, useEffect } from "react";

import { useChainProviders } from "@/context/Chain.context";
import { useInscriptionProvider } from "@/context/Inscriptions.context";
import { useLifeCycleHooks } from "@/context/LifecycleHooks.context";
import { HashMap, IChain, IWallet } from "@/core/types";
import { validateAddress, validateAddressWithPK } from "@/core/utils/wallet";
import { ERROR_CODES, WalletError } from "@/error";

import { useWidgetState } from "./useWidgetState";

/**
 * Connection-time WalletError codes that the user must see in-dialog —
 * silently bouncing back to chain selection would leave the user with no
 * idea why their wallet didn't connect.
 */
const TERMINAL_CONNECT_ERROR_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
]);

interface Props {
  persistent: boolean;
  accountStorage: HashMap;
  onError?: (e: Error) => void;
}

export function useWalletConnectors({ persistent, accountStorage, onError }: Props) {
  const connectors = useChainProviders();
  const {
    visible,
    selectWallet,
    removeWallet,
    displayLoader,
    displayChains,
    displayInscriptions,
    displayError,
    confirm,
    close,
    reset,
    chains: chainMap,
  } = useWidgetState();
  const { showAgain } = useInscriptionProvider();
  const { verifyBTCAddress, acceptTermsOfService } = useLifeCycleHooks();

  // Connecting event
  useEffect(() => {
    if (!visible) return;

    const connectorArr = Object.values(connectors);

    const unsubscribeArr = connectorArr.filter(Boolean).map((connector) =>
      connector.on("connecting", (message?: string, description?: string) => {
        displayLoader?.(message, description);
      }),
    );

    return () => unsubscribeArr.forEach((unsubscribe) => unsubscribe());
  }, [visible, displayLoader, connectors]);

  // Connect Event
  useEffect(() => {
    const connectorArr = Object.values(connectors).filter(Boolean);

    const handlers: Record<string, (connector: any) => (connectedWallet: IWallet) => void> = {
      BTC: (connector) => async (connectedWallet) => {
        try {
          if (!connectedWallet || !connectedWallet.account) return;

          selectWallet?.("BTC", connectedWallet);

          if (persistent && connectedWallet.account?.address) {
            accountStorage.set(connector.id, connectedWallet.id);
          }

          if (!visible) return;

          validateAddress(connector.config.network, connectedWallet.account.address);

          await acceptTermsOfService?.({
            address: connectedWallet.account.address,
            public_key: connectedWallet.account.publicKeyHex,
          });

          const goToNextScreen = () => void (showAgain ? displayInscriptions?.() : displayChains?.());

          if (
            !validateAddressWithPK(
              connectedWallet.account?.address ?? "",
              connectedWallet.account?.publicKeyHex ?? "",
              connector.config.network,
            )
          ) {
            displayError?.({
              title: "Public Key Mismatch",
              description:
                "The Bitcoin address and Public Key for this wallet do not match. Please contact your wallet provider for support.",
              onSubmit: goToNextScreen,
              onCancel: () => {
                connector.disconnect();
                removeWallet?.(connector.id);
                displayChains?.();
              },
            });

            return;
          }

          if (verifyBTCAddress && !(await verifyBTCAddress(connectedWallet.account?.address ?? ""))) {
            displayError?.({
              title: "Staking Currently Unavailable",
              description:
                "Staking is temporarily disabled due to network downtime. New stakes are paused until the network resumes.",
              submitButton: "",
              cancelButton: "Done",
              onCancel: async () => {
                connector.disconnect();
                removeWallet?.(connector.id);
                displayChains?.();
              },
            });

            return;
          }

          goToNextScreen();
        } catch (e: any) {
          connector.disconnect();
          removeWallet?.(connector.id);
          displayError?.({
            title: "Connection Failed",
            description: e.message,
            submitButton: "",
            cancelButton: "Done",
            onCancel: async () => {
              displayChains?.();
            },
          });
        }
      },
      BBN: (connector) => (connectedWallet) => {
        if (connectedWallet) {
          selectWallet?.(connector.id, connectedWallet);

          if (persistent && connectedWallet.account?.address) {
            accountStorage.set(connector.id, connectedWallet.id);
          }
        }

        displayChains?.();
      },
      ETH: (connector) => (connectedWallet) => {
        if (connectedWallet) {
          selectWallet?.(connector.id, connectedWallet);

          if (persistent && connectedWallet.account?.address) {
            accountStorage.set(connector.id, connectedWallet.id);
          }
        }

        displayChains?.();
      },
    };

    const unsubscribeArr = connectorArr.map((connector) =>
      connector.on("connect", handlers[connector.id]?.(connector)),
    );

    connectorArr.forEach((connector) => {
      selectWallet?.(connector.id, connector.connectedWallet);
    });

    return () => unsubscribeArr.forEach((unsubscribe) => unsubscribe());
  }, [
    onError,
    selectWallet,
    removeWallet,
    displayInscriptions,
    displayChains,
    verifyBTCAddress,
    reset,
    close,
    connectors,
    showAgain,
    persistent,
    visible,
  ]);

  // Disconnect Event
  useEffect(() => {
    const connectorArr = Object.values(connectors);

    const unsubscribeArr = connectorArr.filter(Boolean).map((connector) =>
      connector.on("disconnect", (connectedWallet: IWallet) => {
        if (connectedWallet) {
          removeWallet?.(connector.id);
          displayChains?.();
          if (persistent) {
            accountStorage.delete(connector.id);
          }
        }
      }),
    );

    return () => unsubscribeArr.forEach((unsubscribe) => unsubscribe());
  }, [removeWallet, displayChains, connectors, persistent]);

  // Error Event
  useEffect(() => {
    const connectorArr = Object.values(connectors);

    const unsubscribeArr = connectorArr.filter(Boolean).map((connector) =>
      connector.on("error", (error: Error) => {
        onError?.(error);

        // Terminal errors (e.g. the wallet extension is too old) need an
        // in-dialog message so the user can act on them. Anything else
        // falls through to the existing "bounce back to chains" behaviour
        // — host apps' `onError` callbacks still get the raw error.
        // Guard on `displayError` directly so we still fall through to
        // `displayChains?.()` below if the dialog state isn't wired up;
        // otherwise the user could be stranded on the current screen.
        if (
          error instanceof WalletError &&
          TERMINAL_CONNECT_ERROR_CODES.has(error.code) &&
          displayError
        ) {
          const walletName = error.wallet ?? "your wallet";
          displayError({
            title: `Update ${walletName}`,
            description:
              error.message || `${walletName} needs to be updated before you can connect.`,
            submitButton: "",
            cancelButton: "Done",
            onCancel: () => {
              displayChains?.();
            },
          });
          return;
        }

        displayChains?.();
      }),
    );

    return () => unsubscribeArr.forEach((unsubscribe) => unsubscribe());
  }, [onError, displayChains, displayError, connectors]);

  useEffect(() => {
    const requiredChainIds = Object.values(chainMap).filter(Boolean).map(chain => chain.id);
    const allConnectors = Object.values(connectors).filter(Boolean);
    const requiredConnectors = allConnectors.filter(connector =>
      requiredChainIds.includes(connector.id)
    );

    const hasStorage = requiredConnectors.every((connector) => accountStorage.has(connector.id));
    const allConnected = requiredConnectors.every((connector) => connector.connectedWallet !== null);

    if (
      persistent &&
      requiredConnectors.length &&
      hasStorage &&
      allConnected
    ) {
      confirm?.();
      displayChains?.();
    }
  }, [
    persistent,
    connectors,
    chainMap,
    confirm,
    displayChains,
    accountStorage,
  ]);

  const connect = useCallback(
    async (chain: IChain, wallet: IWallet) => {
      const connector = connectors[chain.id as keyof typeof connectors];
      await connector?.connect(wallet.id);
    },
    [connectors],
  );

  const disconnect = useCallback(
    async (chainId: string) => {
      const connector = connectors[chainId as keyof typeof connectors];
      await connector?.disconnect();
    },
    [connectors],
  );

  return { connect, disconnect };
}
