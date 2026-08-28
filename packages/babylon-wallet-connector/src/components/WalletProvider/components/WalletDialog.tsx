import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

import { useChainProviders, type Connectors } from "@/context/Chain.context";
import { useLifeCycleHooks, type WalletLifecycleConnection } from "@/context/LifecycleHooks.context";
import { createConfirmationReceipt, WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { ChainId, HashMap, IBTCProvider, IETHProvider, IWallet } from "@/core/types";
import { useWalletConnectors } from "@/hooks/useWalletConnectors";
import { useWalletWidgets } from "@/hooks/useWalletWidgets";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Screen } from "./Screen";

const WALLET_CHANGED_ERROR_MESSAGE = "Wallet changed while confirming";
const WALLET_NETWORK_MISSING_ERROR_MESSAGE = "Wallet did not report its network";

/**
 * Picks the identity the terms-of-service hook is called with. Required chains
 * are walked in the host's declared order. Connector order can differ from it.
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

function collectConnections(connectors: Connectors): WalletLifecycleConnection[] {
  return Object.entries(connectors).flatMap<WalletLifecycleConnection>(([chain, connector]) => {
    const wallet = connector?.connectedWallet;
    return wallet?.account ? [{ chain: chain as ChainId, wallet, account: { ...wallet.account } }] : [];
  });
}

function freezeConnections(connections: WalletLifecycleConnection[]): WalletLifecycleConnection[] {
  return Object.freeze(
    connections.map(({ chain, wallet, account }) => {
      const frozenAccount = Object.freeze({ ...account });
      const frozenWallet = Object.freeze<IWallet>({ ...wallet, account: frozenAccount });

      return Object.freeze({ chain, wallet: frozenWallet, account: frozenAccount });
    }),
  ) as unknown as WalletLifecycleConnection[];
}

interface ConnectionAuthority {
  chain: ChainId;
  wallet: IWallet;
  provider: IWallet["provider"];
}

function collectAuthority(connections: WalletLifecycleConnection[]): ConnectionAuthority[] {
  return connections.map(({ chain, wallet }) => ({ chain, wallet, provider: wallet.provider }));
}

function hasSameAuthority(left: readonly ConnectionAuthority[], right: readonly ConnectionAuthority[]): boolean {
  return (
    left.length === right.length &&
    left.every(({ chain, wallet, provider }) => {
      const match = right.find((authority) => authority.chain === chain);
      return match?.wallet === wallet && match.provider === provider;
    })
  );
}

async function createConfirmationSnapshot(getConnectors: () => Connectors): Promise<{
  receipt: string;
  connections: WalletLifecycleConnection[];
  authority: readonly ConnectionAuthority[];
}> {
  const connectors = getConnectors();
  const connections = collectConnections(connectors);
  const authority = collectAuthority(connections);
  const receipt = createConfirmationReceipt(connections, connectors);
  const networks: Partial<Record<ChainId, string | number>> = {};

  await Promise.all(
    connections.map(async ({ chain, wallet }) => {
      if ((chain === "ETH" || chain === "BTC") && !wallet.provider) {
        throw new Error(`Connected ${chain} wallet has no provider`);
      }

      if (chain === "ETH") {
        const network = await (wallet.provider as IETHProvider).getChainId();
        if (network === undefined || network === null) throw new Error(WALLET_NETWORK_MISSING_ERROR_MESSAGE);
        networks[chain] = network;
      } else if (chain === "BTC") {
        const network = await (wallet.provider as IBTCProvider).getNetwork();
        if (!network) throw new Error(WALLET_NETWORK_MISSING_ERROR_MESSAGE);
        networks[chain] = network;
      }
    }),
  );

  const settledConnectors = getConnectors();
  const settledConnections = collectConnections(settledConnectors);
  const stable =
    createConfirmationReceipt(settledConnections, settledConnectors) === receipt &&
    hasSameAuthority(authority, collectAuthority(settledConnections));

  if (!stable) {
    throw new Error(WALLET_CHANGED_ERROR_MESSAGE);
  }

  const liveReceipt = createConfirmationReceipt(connections, connectors, networks);
  if (liveReceipt !== receipt) {
    throw new Error("Wallet network does not match the configured network");
  }

  // Restore stays synchronous until #2351 adds live session checks. Store this
  // configured receipt only after it equals the live network identity.
  return { receipt, connections: freezeConnections(connections), authority: Object.freeze(authority) };
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
  const { visible, screen, confirmed, requiredChainIds, close, confirm, displayChains, displayError } =
    useWidgetState();
  const { acceptTermsOfService, onConfirm } = useLifeCycleHooks();
  const connectors = useChainProviders();
  const walletWidgets = useWalletWidgets(connectors, config, onError);
  const { connect } = useWalletConnectors({ persistent, accountStorage: storage, onError });

  const connectorsRef = useRef(connectors);
  const attemptGenerationRef = useRef(0);
  const activeAttemptRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const visibleRef = useRef(visible);

  const invalidateAttempt = useCallback(() => {
    attemptGenerationRef.current += 1;
    activeAttemptRef.current = null;
  }, []);

  useLayoutEffect(() => {
    connectorsRef.current = connectors;
    if (visibleRef.current && !visible) invalidateAttempt();
    visibleRef.current = visible;
  }, [connectors, invalidateAttempt, visible]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateAttempt();
    };
  }, [invalidateAttempt]);

  // Closing without confirming leaves the connectors connected, so the user can
  // reopen and finish where they left off. The receipt written on confirm is
  // the single gate that lets a later reload auto-confirm — no receipt, no
  // silent restore — so leaving the connection up grants nothing on its own.
  const handleClose = useCallback(() => {
    invalidateAttempt();
    close?.();
  }, [close, invalidateAttempt]);

  const handleConfirm = useCallback(async () => {
    if (activeAttemptRef.current !== null || !mountedRef.current || !visibleRef.current) return;

    const generation = attemptGenerationRef.current + 1;
    attemptGenerationRef.current = generation;
    activeAttemptRef.current = generation;
    const isCurrentAttempt = () =>
      activeAttemptRef.current === generation &&
      attemptGenerationRef.current === generation &&
      mountedRef.current &&
      visibleRef.current;

    try {
      if (!confirmed) {
        const confirmationSnapshot = await createConfirmationSnapshot(() => connectorsRef.current);
        if (!isCurrentAttempt()) return;
        const { connections } = confirmationSnapshot;

        // A required chain whose connector has no active account would
        // otherwise drop silently out of `connections` and be confirmed with
        // nothing recorded for it, leaving the next reload to ask again with no
        // signal that anything went wrong.
        const uncovered = requiredChainIds.filter((chainId) => !connections.some(({ chain }) => chain === chainId));
        if (uncovered.length > 0) {
          throw new Error(
            `No connected account for required chain${uncovered.length > 1 ? "s" : ""}: ${uncovered.join(", ")}`,
          );
        }

        const primary = findPrimaryConnection(connections, requiredChainIds);
        const checkIdentity = async () => {
          if (!isCurrentAttempt()) return false;

          const currentSnapshot = await createConfirmationSnapshot(() => connectorsRef.current);
          if (!isCurrentAttempt()) return false;

          if (
            currentSnapshot.receipt !== confirmationSnapshot.receipt ||
            !hasSameAuthority(currentSnapshot.authority, confirmationSnapshot.authority)
          ) {
            throw new Error(WALLET_CHANGED_ERROR_MESSAGE);
          }

          return true;
        };

        if (!(await checkIdentity())) return;

        if (primary) {
          await acceptTermsOfService?.({
            address: primary.account.address,
            public_key: primary.account.publicKeyHex,
            chain: primary.chain,
            connections,
          });
          if (!isCurrentAttempt()) return;
          if (!(await checkIdentity())) return;
        }
        await onConfirm?.(connections);
        if (!isCurrentAttempt()) return;
        if (!(await checkIdentity())) return;

        if (persistent) {
          if (!isCurrentAttempt()) return;
          storage.set(WALLET_CONFIRMATION_RECEIPT_KEY, confirmationSnapshot.receipt);
        }
      }

      if (!isCurrentAttempt()) return;
      confirm?.();
      if (!isCurrentAttempt()) return;
      close?.();
    } catch (error) {
      if (!isCurrentAttempt()) return;

      const normalizedError = error instanceof Error ? error : new Error("Wallet confirmation failed");
      onError?.(normalizedError);
      if (!isCurrentAttempt()) return;
      displayError?.({
        title: "Connection Failed",
        description: normalizedError.message,
        submitButton: "",
        cancelButton: "Done",
        onCancel: displayChains,
      });
    } finally {
      if (attemptGenerationRef.current === generation && activeAttemptRef.current === generation) {
        activeAttemptRef.current = null;
      }
    }
  }, [
    acceptTermsOfService,
    close,
    confirm,
    confirmed,
    displayChains,
    displayError,
    onConfirm,
    onError,
    persistent,
    requiredChainIds,
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
