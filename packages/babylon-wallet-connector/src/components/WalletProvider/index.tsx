import { useMemo, type PropsWithChildren } from "react";

import { ChainConfigArr, ChainProvider } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { TomoConnectionProvider } from "@/context/TomoProvider";
import { createAccountStorage } from "@/core/storage";
import { APPKIT_BTC_CONNECTOR_ID } from "@/core/wallets/btc/appkit";
import { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/eth/appkit";
import { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/appkit/appKitModal";
import { useAppKitBtcOpenListener } from "@/hooks/useAppKitBtcOpenListener";
import { useAppKitOpenListener } from "@/hooks/useAppKitOpenListener";
import { TomoBBNConnector } from "@/widgets/tomo/BBNConnector";
import { TomoBTCConnector } from "@/widgets/tomo/BTCConnector";

import { WalletDialog } from "./components/WalletDialog";
import { ONE_HOUR } from "./constants";

interface WalletProviderProps {
  ttl?: number;
  persistent?: boolean;
  theme?: string;
  lifecycleHooks?: LifeCycleHooksProps;
  context?: any;
  config: Readonly<ChainConfigArr>;
  onError?: (e: Error) => void;
  disabledWallets?: string[];
  requiredChains?: ("BTC" | "BBN" | "ETH")[];
  /**
   * Unified AppKit configuration for ETH and/or BTC wallet connections
   * Provide eth and/or btc properties to enable respective chains
   */
  appKitConfig?: AppKitModalConfig;
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
}: PropsWithChildren<WalletProviderProps>) {
  const storage = useMemo(() => createAccountStorage(ttl), [ttl]);

  // Initialize unified AppKit modal synchronously before render (only if config provided)
  // This ensures both wagmi and bitcoin configs are available before children mount
  // Tracks which AppKit wallets should be disabled due to missing project ID or initialization failure
  const appKitDisabledWallets = useMemo(() => {
    const disabled: string[] = [];

    // If AppKit config is not provided, assume external initialization
    // and don't attempt to initialize here
    if (!appKitConfig) {
      return disabled;
    }

    try {
      // Initialize AppKit with the unified config
      // Config may have eth and/or btc properties
      const result = initializeAppKitModal(appKitConfig);

      // If initialization failed (null returned), disable AppKit wallets
      if (!result) {
        // Disable ETH wallet if eth was configured
        if (appKitConfig.eth) {
          disabled.push(APPKIT_ETH_CONNECTOR_ID);
        }
        // Disable BTC wallet if btc was configured
        if (appKitConfig.btc) {
          disabled.push(APPKIT_BTC_CONNECTOR_ID);
        }
      }
    } catch (error) {
      console.error("Failed to initialize AppKit modal:", error);
      // On error, disable both wallets to be safe
      if (appKitConfig.eth) {
        disabled.push(APPKIT_ETH_CONNECTOR_ID);
      }
      if (appKitConfig.btc) {
        disabled.push(APPKIT_BTC_CONNECTOR_ID);
      }
    }

    return disabled;
  }, [appKitConfig]);

  // Merge user-provided disabled wallets with auto-disabled AppKit wallets
  const allDisabledWallets = useMemo(
    () => [...disabledWallets, ...appKitDisabledWallets],
    [disabledWallets, appKitDisabledWallets],
  );

  // Listen for requests to open the AppKit modals (triggered by connectors)
  // These hooks gracefully handle cases where AppKit is not initialized
  useAppKitOpenListener();
  useAppKitBtcOpenListener();

  return (
    <TomoConnectionProvider theme={theme} config={config}>
      <LifeCycleHooksProvider value={lifecycleHooks}>
        <ChainProvider
          persistent={persistent}
          storage={storage}
          context={context}
          config={config}
          onError={onError}
          disabledWallets={allDisabledWallets}
          requiredChains={requiredChains}
        >
          {children}
          <TomoBTCConnector persistent={persistent} storage={storage} />
          <TomoBBNConnector persistent={persistent} storage={storage} />
          <WalletDialog persistent={persistent} storage={storage} config={config} onError={onError} />
        </ChainProvider>
      </LifeCycleHooksProvider>
    </TomoConnectionProvider>
  );
}
