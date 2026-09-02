import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

import { useChainProviders, type Connectors } from "@/context/Chain.context";
import { useLifeCycleHooks, type WalletLifecycleConnection } from "@/context/LifecycleHooks.context";
import {
  confirmedChains,
  createConfirmationReceipt,
  sameIdentity,
  subscribeToConfirmationIdentityChanges,
  WALLET_CONFIRMATION_RECEIPT_KEY,
} from "@/core/confirmationReceipt";
import type { ChainId, HashMap, IBTCProvider, IETHProvider, IWallet } from "@/core/types";
import { useWalletConnectors } from "@/hooks/useWalletConnectors";
import { useWalletWidgets } from "@/hooks/useWalletWidgets";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Screen } from "./Screen";

const WALLET_CHANGED_ERROR_MESSAGE = "Wallet changed while confirming";
const WALLET_NETWORK_MISSING_ERROR_MESSAGE = "Wallet did not report its network";
const WALLET_NETWORK_MISMATCH_ERROR_MESSAGE = "Wallet network does not match the configured network";
const WALLET_PROVIDER_MISSING_ERROR_MESSAGE = "Connected wallet has no provider";

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

function copyConnections(connections: WalletLifecycleConnection[]): WalletLifecycleConnection[] {
  return connections.map(({ chain, wallet, account }) => {
    const accountCopy = { ...account };
    const walletCopy: IWallet = {
      id: wallet.id,
      name: wallet.name,
      icon: wallet.icon,
      iconBackground: wallet.iconBackground,
      docs: wallet.docs,
      installed: wallet.installed,
      provider: wallet.provider,
      account: accountCopy,
      label: wallet.label,
      hardware: wallet.hardware,
    };

    return { chain, wallet: walletCopy, account: accountCopy };
  });
}

interface ConnectionIdentity {
  chain: ChainId;
  wallet: IWallet;
  provider: IWallet["provider"];
  receipt: string;
}

function hasSameIdentity(
  expected: readonly ConnectionIdentity[],
  current: readonly ConnectionIdentity[],
  requiredChainIds: readonly string[],
): boolean {
  return expected.every(({ chain, wallet, provider, receipt }) => {
    const match = current.find((identity) => identity.chain === chain);
    if (!match) return !requiredChainIds.includes(chain);

    return match.wallet === wallet && match.provider === provider && match.receipt === receipt;
  });
}

async function createConfirmationSnapshot(
  getConnectors: () => Connectors,
  requiredChainIds: readonly string[],
  onOptionalError?: (error: Error) => void,
): Promise<{
  receipt: string;
  connections: WalletLifecycleConnection[];
  identities: readonly ConnectionIdentity[];
}> {
  const connectors = getConnectors();
  const candidates = collectConnections(connectors).map((connection) => ({
    connection,
    provider: connection.wallet.provider,
    receipt: createConfirmationReceipt([connection], connectors),
  }));

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const { chain } = candidate.connection;
      const { provider } = candidate;

      try {
        if (!provider) throw new Error(`${WALLET_PROVIDER_MISSING_ERROR_MESSAGE}: ${chain}`);

        if (provider.isIdentityCurrent?.() === false) {
          throw new Error(WALLET_CHANGED_ERROR_MESSAGE);
        }

        let network: string | number | undefined;
        if (chain === "ETH" || chain === "BTC") {
          // Fixed-network providers report their operational network here. They
          // have no independent wallet network that the user can switch.
          network =
            chain === "ETH"
              ? await (provider as IETHProvider).getChainId()
              : await (provider as IBTCProvider).getNetwork();
          if (network === undefined || network === null || !String(network)) {
            throw new Error(WALLET_NETWORK_MISSING_ERROR_MESSAGE);
          }

          const liveReceipt = createConfirmationReceipt([candidate.connection], connectors, { [chain]: network });
          if (liveReceipt !== candidate.receipt) {
            throw new Error(WALLET_NETWORK_MISMATCH_ERROR_MESSAGE);
          }
        }

        const [address, publicKeyHex] = await Promise.all([provider.getAddress(), provider.getPublicKeyHex()]);
        if (
          !address ||
          !publicKeyHex ||
          !sameIdentity(address, candidate.connection.account.address) ||
          !sameIdentity(publicKeyHex, candidate.connection.account.publicKeyHex)
        ) {
          throw new Error(WALLET_CHANGED_ERROR_MESSAGE);
        }

        if (provider.isIdentityCurrent?.() === false) {
          throw new Error(WALLET_CHANGED_ERROR_MESSAGE);
        }

        // IBBNProvider has no network getter. Its live account identity is
        // still checked above.
        return {
          ...candidate,
          connection: { ...candidate.connection, account: { address, publicKeyHex } },
        };
      } catch (error) {
        if (requiredChainIds.includes(chain)) throw error;
        onOptionalError?.(error instanceof Error ? error : new Error("Optional wallet verification failed"));
        return null;
      }
    }),
  );

  const verifiedCandidates = results.filter(
    (candidate): candidate is (typeof candidates)[number] => candidate !== null,
  );
  const settledConnectors = getConnectors();
  const settledConnections = collectConnections(settledConnectors);
  const stableCandidates = verifiedCandidates.flatMap((candidate) => {
    const { connection, receipt } = candidate;
    const settled = settledConnections.find(({ chain }) => chain === connection.chain);
    const stable = Boolean(
      settled &&
        settled.wallet === connection.wallet &&
        settled.wallet.provider === candidate.provider &&
        createConfirmationReceipt([settled], settledConnectors) === receipt,
    );

    if (stable) return [candidate];
    if (requiredChainIds.includes(connection.chain)) throw new Error(WALLET_CHANGED_ERROR_MESSAGE);
    onOptionalError?.(new Error(WALLET_CHANGED_ERROR_MESSAGE));
    return [];
  });
  const connections = stableCandidates.map(({ connection }) => connection);
  const identities = stableCandidates.map(({ connection, provider, receipt }) => ({
    chain: connection.chain,
    wallet: connection.wallet,
    provider,
    receipt,
  }));

  // Restore stays synchronous until #2351 adds live session checks. Store this
  // configured receipt only after it equals the live network identity.
  return {
    receipt: createConfirmationReceipt(connections, settledConnectors),
    connections,
    identities: Object.freeze(identities),
  };
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
  const { visible, screen, confirmed, requiredChainIds, close, confirm, unconfirm, displayChains, displayError } =
    useWidgetState();
  const { acceptTermsOfService, onConfirm } = useLifeCycleHooks();
  const connectors = useChainProviders();
  const walletWidgets = useWalletWidgets(connectors, config, onError);
  const { connect } = useWalletConnectors({ persistent, accountStorage: storage, onError });

  const connectorsRef = useRef(connectors);
  const attemptGenerationRef = useRef(0);
  const activeAttemptRef = useRef<number | null>(null);
  const activeIdentitySubscriptionRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(false);
  const visibleRef = useRef(visible);
  const confirmedRef = useRef(confirmed);
  const confirmationInputsRef = useRef({ persistent, requiredChainIds: [...requiredChainIds], storage });

  const invalidateAttempt = useCallback(() => {
    const stopWatchingIdentity = activeIdentitySubscriptionRef.current;
    activeIdentitySubscriptionRef.current = null;
    attemptGenerationRef.current += 1;
    activeAttemptRef.current = null;
    stopWatchingIdentity?.();
  }, []);

  useLayoutEffect(() => {
    connectorsRef.current = connectors;
    if ((visibleRef.current && !visible) || (!confirmedRef.current && confirmed)) invalidateAttempt();
    visibleRef.current = visible;
    confirmedRef.current = confirmed;
  }, [confirmed, connectors, invalidateAttempt, visible]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateAttempt();
    };
  }, [invalidateAttempt]);

  useLayoutEffect(() => {
    const previous = confirmationInputsRef.current;
    const requiredChainsChanged =
      previous.requiredChainIds.length !== requiredChainIds.length ||
      previous.requiredChainIds.some((chainId, index) => chainId !== requiredChainIds[index]);

    if (previous.persistent !== persistent || previous.storage !== storage || requiredChainsChanged) {
      invalidateAttempt();
    }
    confirmationInputsRef.current = { persistent, requiredChainIds: [...requiredChainIds], storage };
  }, [invalidateAttempt, persistent, requiredChainIds, storage]);

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
    let stopWatchingIdentity = () => {};
    let confirmationHandoffPending = false;

    try {
      if (!confirmed) {
        const initialConnectors = connectorsRef.current;
        const initialReceipt = createConfirmationReceipt(collectConnections(initialConnectors), initialConnectors);
        const unsubscribeIdentity = subscribeToConfirmationIdentityChanges(
          initialReceipt,
          confirmedChains(initialReceipt),
          initialConnectors,
          () => {
            invalidateAttempt();
            storage.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
            unconfirm?.();
          },
        );
        let watchingIdentity = true;
        stopWatchingIdentity = () => {
          if (!watchingIdentity) return;
          watchingIdentity = false;
          unsubscribeIdentity();
        };
        if (!isCurrentAttempt()) {
          stopWatchingIdentity();
          return;
        }
        activeIdentitySubscriptionRef.current = stopWatchingIdentity;

        const confirmationSnapshot = await createConfirmationSnapshot(
          () => connectorsRef.current,
          requiredChainIds,
          onError,
        );
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

          const currentSnapshot = await createConfirmationSnapshot(
            () => connectorsRef.current,
            requiredChainIds,
            onError,
          );
          if (!isCurrentAttempt()) return false;

          if (!hasSameIdentity(confirmationSnapshot.identities, currentSnapshot.identities, requiredChainIds)) {
            throw new Error(WALLET_CHANGED_ERROR_MESSAGE);
          }

          return true;
        };

        if (primary) {
          await acceptTermsOfService?.({
            address: primary.account.address,
            public_key: primary.account.publicKeyHex,
            chain: primary.chain,
            connections: copyConnections(connections),
          });
          if (!(await checkIdentity())) return;
        }
        await onConfirm?.(copyConnections(connections));
        if (!(await checkIdentity())) return;

        if (persistent) {
          storage.set(WALLET_CONFIRMATION_RECEIPT_KEY, confirmationSnapshot.receipt);
        }

        if (!isCurrentAttempt()) return;
        confirm?.(confirmationSnapshot.receipt);
        if (!isCurrentAttempt()) return;
        confirmationHandoffPending = Boolean(confirm);
      }

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
      if (!confirmationHandoffPending) {
        stopWatchingIdentity();
        if (activeIdentitySubscriptionRef.current === stopWatchingIdentity) {
          activeIdentitySubscriptionRef.current = null;
        }
        if (attemptGenerationRef.current === generation && activeAttemptRef.current === generation) {
          activeAttemptRef.current = null;
        }
      }
    }
  }, [
    acceptTermsOfService,
    close,
    confirm,
    confirmed,
    displayChains,
    displayError,
    invalidateAttempt,
    onConfirm,
    onError,
    persistent,
    requiredChainIds,
    storage,
    unconfirm,
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
