import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { useChainProviders } from "@/context/Chain.context";
import { useLifeCycleHooks } from "@/context/LifecycleHooks.context";
import {
  confirmedChains,
  isConfirmationReceiptCovered,
  isLiveConfirmationReceiptValid,
  isValidConfirmationReceipt,
  subscribeToConfirmationIdentityChanges,
  WALLET_CONFIRMATION_RECEIPT_KEY,
} from "@/core/confirmationReceipt";
import { ChainId, HashMap, IChain, IConnector, IETHProvider, IWallet, Network } from "@/core/types";
import { resolveFirstPartyIcon } from "@/core/wallets/firstPartyIcons";
import { ERROR_CODES, WalletError } from "@/error";

import { useWidgetState } from "./useWidgetState";

/**
 * AppKit exposes a single generic "Ethereum" wallet entry, so the connected
 * wallet's static metadata carries a generic chain icon/name rather than the
 * actual wallet the user picked (MetaMask, Rainbow, ...). Re-resolve the
 * display identity from the provider, which reads it off the live wagmi
 * connector, so the selected-wallet UI shows the real wallet.
 */
async function resolveEthDisplayWallet(wallet: IWallet): Promise<IWallet> {
  const provider = wallet.provider as IETHProvider | null;
  if (!provider?.getWalletProviderName || !provider?.getWalletProviderIcon) return wallet;

  const [name, icon] = await Promise.all([provider.getWalletProviderName(), provider.getWalletProviderIcon()]);
  const firstParty = resolveFirstPartyIcon(name || wallet.name);

  return {
    id: wallet.id,
    name: name || wallet.name,
    icon: firstParty?.icon || icon || wallet.icon,
    iconBackground: firstParty?.iconBackground,
    docs: wallet.docs,
    installed: wallet.installed,
    provider: wallet.provider,
    account: wallet.account,
    label: wallet.label,
    hardware: wallet.hardware,
  };
}

/**
 * Connection-time WalletError codes that the user must see in-dialog —
 * silently bouncing back to chain selection would leave the user with no
 * idea why their wallet didn't connect.
 */
const TERMINAL_CONNECT_ERROR_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.INCOMPATIBLE_WALLET_VERSION,
]);

export interface BTCAddressValidation {
  validateAddress(network: Network, address: string): void;
  validateAddressWithPK(address: string, publicKey: string, network: Network): boolean;
}

interface Props {
  persistent: boolean;
  accountStorage: HashMap;
  onError?: (e: Error) => void;
  btcValidation?: BTCAddressValidation;
}

export function useWalletConnectors({ persistent, accountStorage, onError, btcValidation }: Props) {
  const connectors = useChainProviders();
  const {
    confirmed,
    confirmationReceipt,
    visible,
    selectWallet,
    removeWallet,
    displayLoader,
    displayChains,
    displayError,
    confirm,
    unconfirm,
    requiredChainIds = [],
  } = useWidgetState();
  const { verifyBTCAddress } = useLifeCycleHooks();
  const validationGenerationRef = useRef(0);
  const previousRequiredChainIdsRef = useRef(requiredChainIds);
  const confirmationCandidate = confirmationReceipt ??
    (persistent && !visible ? accountStorage.get(WALLET_CONFIRMATION_RECEIPT_KEY) : undefined);
  const confirmationCandidateRef = useRef<string>();
  const dirtyOptionalChainsRef = useRef<Set<ChainId>>(new Set());
  const requiredConnectorsReady = requiredChainIds.every(
    (chainId) => connectors[chainId as ChainId]?.connectedWallet,
  );

  const dropRejectedWallet = (connector: Pick<IConnector, "id" | "disconnect">) => {
    connector.disconnect().catch((error) => {
      if (error instanceof WalletError && error.code === ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED) return;
      console.error("Failed to disconnect rejected wallet:", error instanceof Error ? error.message : "Unknown error");
    });
    removeWallet?.(connector.id);
    if (persistent) {
      accountStorage.delete(connector.id);
    }
  };

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
          if (!btcValidation) throw new Error("Bitcoin address validation is unavailable");

          selectWallet?.("BTC", connectedWallet);

          if (persistent && connectedWallet.account?.address) {
            accountStorage.set(connector.id, connectedWallet.id);
          }

          if (!visible) return;

          btcValidation.validateAddress(connector.config.network, connectedWallet.account.address);

          const goToNextScreen = () => void displayChains?.();

          if (
            !btcValidation.validateAddressWithPK(
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
                dropRejectedWallet(connector);
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
                dropRejectedWallet(connector);
                displayChains?.();
              },
            });

            return;
          }

          goToNextScreen();
        } catch (e: any) {
          dropRejectedWallet(connector);
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
      ETH: (connector) => async (connectedWallet) => {
        if (connectedWallet) {
          selectWallet?.(connector.id, await resolveEthDisplayWallet(connectedWallet));

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
      const connectedWallet = connector.connectedWallet;
      if (connector.id === "ETH" && connectedWallet) {
        void resolveEthDisplayWallet(connectedWallet).then((wallet) => selectWallet?.(connector.id, wallet));
        return;
      }
      selectWallet?.(connector.id, connectedWallet);
    });

    return () => unsubscribeArr.forEach((unsubscribe) => unsubscribe());
  }, [
    onError,
    selectWallet,
    removeWallet,
    displayChains,
    displayError,
    verifyBTCAddress,
    btcValidation,
    accountStorage,
    connectors,
    persistent,
    visible,
  ]);

  // Disconnect Event
  useLayoutEffect(() => {
    const connectorArr = Object.values(connectors);

    const unsubscribeArr = connectorArr.filter(Boolean).map((connector) =>
      connector.on("disconnect", (connectedWallet: IWallet) => {
        if (connectedWallet) {
          // Losing a required chain invalidates the confirmation it was part
          // of, so the receipt must not survive to auto-confirm a later
          // reconnect. An optional chain leaving is not a consent change.
          if (requiredChainIds.includes(connector.id)) {
            validationGenerationRef.current += 1;
            accountStorage.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
          }
          removeWallet?.(connector.id);
          displayChains?.();
          if (persistent) {
            accountStorage.delete(connector.id);
          }
        }
      }),
    );

    return () => unsubscribeArr.forEach((unsubscribe) => unsubscribe());
  }, [removeWallet, displayChains, connectors, persistent, accountStorage, requiredChainIds]);

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

        if (
          error instanceof WalletError &&
          error.code === ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED &&
          displayError
        ) {
          displayError({
            title: "Wallets share one session",
            description: error.message,
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

  const validateConfirmation = useCallback(async () => {
    const generation = ++validationGenerationRef.current;
    if (!confirmationCandidate) return;

    if (!confirmationReceipt && !requiredConnectorsReady) return;

    const covered = await isLiveConfirmationReceiptValid(confirmationCandidate, requiredChainIds, connectors);
    if (generation !== validationGenerationRef.current) return;

    if (!covered) {
      accountStorage.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
      unconfirm?.();
      return;
    }

    if (!confirmed && !visible) {
      confirm?.(confirmationCandidate);
      displayChains?.();
      return;
    }

    // Keep the stored receipt alive with its confirmed session.
    if (persistent && confirmed) {
      accountStorage.set(WALLET_CONFIRMATION_RECEIPT_KEY, confirmationCandidate);
    }
  }, [
    accountStorage,
    confirmationCandidate,
    confirmationReceipt,
    confirmed,
    confirm,
    connectors,
    displayChains,
    persistent,
    requiredChainIds,
    requiredConnectorsReady,
    unconfirm,
    visible,
  ]);

  useEffect(() => {
    void validateConfirmation();
  }, [validateConfirmation]);

  useLayoutEffect(() => {
    const previousCandidate = confirmationCandidateRef.current;
    if (!confirmationCandidate || (previousCandidate && previousCandidate !== confirmationCandidate)) {
      dirtyOptionalChainsRef.current.clear();
    }
    confirmationCandidateRef.current = confirmationCandidate;
  }, [confirmationCandidate]);

  useLayoutEffect(() => {
    validationGenerationRef.current += 1;
    const newlyRequiredChainIds = requiredChainIds.filter(
      (chainId) => !previousRequiredChainIdsRef.current.includes(chainId),
    );
    previousRequiredChainIdsRef.current = requiredChainIds;
    if (!confirmationCandidate) return;

    const stopWatchingIdentity = subscribeToConfirmationIdentityChanges(
      confirmationCandidate,
      confirmedChains(confirmationCandidate),
      connectors,
      (chain) => {
        if (!requiredChainIds.includes(chain)) {
          dirtyOptionalChainsRef.current.add(chain);
          return;
        }

        validationGenerationRef.current += 1;
        accountStorage.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
        unconfirm?.();
      },
    );
    if (!confirmationReceipt && !requiredConnectorsReady) return stopWatchingIdentity;

    if (
      !isConfirmationReceiptCovered(confirmationCandidate, requiredChainIds, connectors) ||
      newlyRequiredChainIds.some((chainId) => dirtyOptionalChainsRef.current.has(chainId as ChainId)) ||
      (confirmationReceipt &&
        newlyRequiredChainIds.length > 0 &&
        !isValidConfirmationReceipt(confirmationCandidate, newlyRequiredChainIds, connectors))
    ) {
      stopWatchingIdentity();
      accountStorage.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
      unconfirm?.();
      return;
    }

    if (confirmationReceipt && newlyRequiredChainIds.length > 0) {
      unconfirm?.(true);
    }

    return stopWatchingIdentity;
  }, [
    accountStorage,
    confirmationCandidate,
    confirmationReceipt,
    connectors,
    requiredChainIds,
    requiredConnectorsReady,
    unconfirm,
  ]);

  useEffect(
    () => () => {
      validationGenerationRef.current += 1;
    },
    [],
  );

  const connect = useCallback(
    async (chain: IChain, wallet: IWallet) => {
      const connector = connectors[chain.id as keyof typeof connectors];
      await connector?.connect(wallet.id);
    },
    [connectors],
  );

  return { connect };
}
