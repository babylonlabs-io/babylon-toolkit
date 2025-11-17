import { useMemo, type PropsWithChildren } from "react";

import { ChainConfigArr, ChainProvider } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { TomoConnectionProvider } from "@/context/TomoProvider";
import { createAccountStorage } from "@/core/storage";
import { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/appkit/appKitModal";
import { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";
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
  useMemo(() => {
    if (!appKitConfig) {
      return;
    }

    try {
      // Initialize AppKit with the unified config
      // Config may have eth and/or btc properties
      initializeAppKitModal(appKitConfig);
    } catch (error) {
      console.error("Failed to initialize AppKit modal:", error);
    }
  }, [appKitConfig]);


  // Listen for requests to open the AppKit modal (triggered by connectors)
  // This hook gracefully handles cases where AppKit is not initialized
  useAppKitOpenListener();

  return (
    <TomoConnectionProvider theme={theme} config={config}>
      <LifeCycleHooksProvider value={lifecycleHooks}>
        <ChainProvider
          persistent={persistent}
          storage={storage}
          context={context}
          config={config}
          onError={onError}
          disabledWallets={disabledWallets}
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
