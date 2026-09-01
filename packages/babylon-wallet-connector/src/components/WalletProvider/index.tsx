import { useEffect, useMemo, useRef, type PropsWithChildren, type ReactNode } from "react";

import { ONE_HOUR } from "@/constants";
import { ChainConfigArr, ChainProvider, type ChainMetadataMap } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { TomoConnectionProvider } from "@/context/TomoProvider";
import { createAccountStorage } from "@/core/storage";
import type { BBNConfig, BTCConfig, ChainId, ETHConfig } from "@/core/types";
import chainMetadata from "@/core/wallets";
import { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/appkit/appKitModal";
import { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";
import { TomoBBNConnector } from "@/widgets/tomo/BBNConnector";
import { TomoBTCConnector } from "@/widgets/tomo/BTCConnector";

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

const metadata: ChainMetadataMap = chainMetadata;

export interface WalletProviderProps {
  ttl?: number;
  persistent?: boolean;
  theme?: string;
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
  disableTomo?: boolean;
  /** Optional content rendered top-right of the wallet dialog, mirroring the close/back button (e.g. a settings trigger). */
  dialogActions?: ReactNode;
  /** Overrides the wallet dialog's close/back button default `left-4` position. */
  dialogCloseButtonClassName?: string;
  /** Overrides the wallet dialog's `dialogActions` slot default `right-4` position. */
  dialogActionsClassName?: string;
}

export function WalletProvider({
  ttl = ONE_HOUR,
  persistent = false,
  theme,
  lifecycleHooks,
  children,
  config,
  context = window,
  onError,
  disabledWallets = [],
  requiredChains,
  appKitConfig,
  disableTomo = false,
  dialogActions,
  dialogCloseButtonClassName,
  dialogActionsClassName,
}: PropsWithChildren<WalletProviderProps>) {
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

  const tree = (
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
        {!disableTomo && (
          <>
            <TomoBTCConnector persistent={persistent} storage={storage} />
            <TomoBBNConnector persistent={persistent} storage={storage} />
          </>
        )}
        <WalletDialog
          persistent={persistent}
          storage={storage}
          config={config}
          onError={onError}
          actions={dialogActions}
          closeButtonClassName={dialogCloseButtonClassName}
          actionsClassName={dialogActionsClassName}
        />
      </ChainProvider>
    </LifeCycleHooksProvider>
  );

  if (disableTomo) {
    return tree;
  }

  return (
    <TomoConnectionProvider theme={theme} config={config}>
      {tree}
    </TomoConnectionProvider>
  );
}
