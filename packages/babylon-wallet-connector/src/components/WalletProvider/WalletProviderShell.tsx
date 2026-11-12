import { useEffect, useMemo, useRef, type PropsWithChildren, type ReactNode } from "react";

import { ONE_HOUR } from "@/constants";
import { ChainConfigArr, ChainProvider, type ChainMetadataMap } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { createAccountStorage } from "@/core/storage";
import type { BBNConfig, BTCConfig, ChainId, ETHConfig, HashMap, IChain } from "@/core/types";
import { validateAddress, validateAddressWithPK } from "@/core/utils/wallet";
import { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/appkit/appKitModal";
import { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";

import { WalletDialog } from "./components/WalletDialog";

function deriveNetworkMap(config: Readonly<ChainConfigArr>): Record<string, string> {
  const map: Record<string, string> = {};

  for (const entry of config) {
    switch (entry.chain) {
      case "BTC":
        map.BTC = (entry.config as BTCConfig).network.toString();
        break;
      case "BBN":
        map.BBN = (entry.config as BBNConfig).chainId;
        break;
      case "ETH":
        map.ETH = (entry.config as ETHConfig).chainId.toString();
        break;
    }
  }

  return map;
}

const btcValidation = { validateAddress, validateAddressWithPK };

/**
 * The props every entry point's `WalletProvider` shares. Entry points extend
 * this interface rather than `Omit<>` the shell's: Storybook's react-docgen
 * expands an `extends` clause (`applyExtends`) but not a mapped type, and the
 * URL args its stories take are dropped for a prop it cannot see.
 */
export interface WalletProviderCommonProps {
  ttl?: number;
  persistent?: boolean;
  lifecycleHooks?: LifeCycleHooksProps;
  context?: any;
  config: Readonly<ChainConfigArr>;
  onError?: (e: Error) => void;
  disabledWallets?: string[];
  /**
   * Chains that must be connected before the dialog can be confirmed. Chains
   * outside this set are still offered, they just never block confirm.
   * Defaults to every configured chain.
   */
  requiredChains?: readonly ChainId[];
  /**
   * Unified AppKit configuration for ETH and/or BTC wallet connections
   * Provide eth and/or btc properties to enable respective chains
   */
  appKitConfig?: AppKitModalConfig;
  /** Optional content rendered top-right of the wallet dialog, mirroring the close/back button (e.g. a settings trigger). */
  dialogActions?: ReactNode;
  /** Overrides the wallet dialog's close/back button default `left-4` position. */
  dialogCloseButtonClassName?: string;
  /** Overrides the wallet dialog's `dialogActions` slot default `right-4` position. */
  dialogActionsClassName?: string;
  /** A short line under each chain's name on the connect screen that says why the app needs that wallet. */
  chainDescriptions?: Partial<Record<ChainId, string>>;
  isChainHidden?: (chain: IChain) => boolean;
}

export interface WalletProviderShellProps extends WalletProviderCommonProps {
  /** The chains this shell offers. An entry point passes only the metadata its module graph may carry. */
  metadata: ChainMetadataMap;
  /** Extra connector widgets, rendered inside the chain context after `children`. */
  connectors?: (shell: { persistent: boolean; storage: HashMap }) => ReactNode;
}

/**
 * The wallet-dialog shell every multi-chain entry point shares: account
 * storage, AppKit initialization and its failure reporting, the lifecycle and
 * chain contexts, and the dialog. Entry points differ only in the chain
 * metadata and connectors they pass, which is what keeps a wallet SDK out of
 * an entry that does not offer its chain.
 */
export function WalletProviderShell({
  ttl = ONE_HOUR,
  persistent = false,
  lifecycleHooks,
  children,
  config,
  context = window,
  onError,
  disabledWallets = [],
  requiredChains,
  appKitConfig,
  dialogActions,
  dialogCloseButtonClassName,
  dialogActionsClassName,
  chainDescriptions,
  isChainHidden,
  metadata,
  connectors,
}: PropsWithChildren<WalletProviderShellProps>) {
  const networkMap = useMemo(() => deriveNetworkMap(config), [config]);
  const storage = useMemo(() => createAccountStorage(ttl, networkMap), [ttl, networkMap]);

  // Initialize unified AppKit modal synchronously before render (only if config provided)
  // This ensures both wagmi and bitcoin configs are available before children mount
  const appKitInitializationFailure = useMemo(() => {
    if (!appKitConfig) {
      return null;
    }

    try {
      // Initialize AppKit with the unified config
      // Config may have eth and/or btc properties
      initializeAppKitModal(appKitConfig);
      return null;
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error("Failed to initialize AppKit modal", { cause: error }),
      };
    }
  }, [appKitConfig]);

  const reportedAppKitFailure = useRef<typeof appKitInitializationFailure>(null);
  const loggedAppKitFailure = useRef<typeof appKitInitializationFailure>(null);

  useEffect(() => {
    if (!appKitInitializationFailure) {
      reportedAppKitFailure.current = null;
      loggedAppKitFailure.current = null;
      return;
    }

    if (loggedAppKitFailure.current !== appKitInitializationFailure) {
      loggedAppKitFailure.current = appKitInitializationFailure;
      console.error("Failed to initialize AppKit modal:", appKitInitializationFailure.error.message);
    }

    if (!onError || reportedAppKitFailure.current === appKitInitializationFailure) return;

    reportedAppKitFailure.current = appKitInitializationFailure;
    onError(appKitInitializationFailure.error);
  }, [appKitInitializationFailure, onError]);

  // Listen for requests to open the AppKit modal (triggered by connectors)
  // This hook gracefully handles cases where AppKit is not initialized
  useAppKitOpenListener();

  return (
    <LifeCycleHooksProvider value={lifecycleHooks}>
      <ChainProvider
        persistent={persistent}
        storage={storage}
        context={context}
        config={config}
        onError={onError}
        disabledWallets={disabledWallets}
        requiredChains={requiredChains}
        metadata={metadata}
      >
        {children}
        {connectors?.({ persistent, storage })}
        <WalletDialog
          btcValidation={btcValidation}
          persistent={persistent}
          storage={storage}
          config={config}
          onError={onError}
          actions={dialogActions}
          closeButtonClassName={dialogCloseButtonClassName}
          actionsClassName={dialogActionsClassName}
          chainDescriptions={chainDescriptions}
          isChainHidden={isChainHidden}
        />
      </ChainProvider>
    </LifeCycleHooksProvider>
  );
}
