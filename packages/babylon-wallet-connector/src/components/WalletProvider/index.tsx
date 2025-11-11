import { useMemo, type PropsWithChildren } from "react";

import { ChainConfigArr, ChainProvider } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { TomoConnectionProvider } from "@/context/TomoProvider";
import { createAccountStorage } from "@/core/storage";
import { TomoBBNConnector } from "@/widgets/tomo/BBNConnector";
import { TomoBTCConnector } from "@/widgets/tomo/BTCConnector";
import { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/eth/appkit/appKitModal";
import { initializeAppKitBtcModal, type AppKitBtcModalConfig } from "@/core/wallets/btc/appkit/appKitBtcModal";
import { useAppKitOpenListener } from "@/hooks/useAppKitOpenListener";
import { useAppKitBtcOpenListener } from "@/hooks/useAppKitBtcOpenListener";

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
  appKitConfig?: AppKitModalConfig;
  appKitBtcConfig?: AppKitBtcModalConfig;
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
  disabledWallets,
  requiredChains,
  appKitConfig,
  appKitBtcConfig,
}: PropsWithChildren<WalletProviderProps>) {
  const storage = useMemo(() => createAccountStorage(ttl), [ttl]);

  // Initialize unified AppKit modal synchronously before render
  // This ensures both wagmi and bitcoin configs are available before children mount
  useMemo(() => {
    try {
      const hasETH = config?.some((c) => c.chain === "ETH");
      const hasBTC = config?.some((c) => c.chain === "BTC");

      // Only initialize if we have ETH (appKitConfig is required)
      if (hasETH && appKitConfig) {
        // Prepare BTC config if both ETH and BTC chains are enabled
        const btcConfig = hasBTC && appKitBtcConfig ? {
          network: appKitBtcConfig.network || "mainnet" as const
        } : undefined;

        initializeAppKitModal(
          {
            ...appKitConfig,
            themeMode: theme === "dark" ? "dark" : "light",
          },
          btcConfig
        );
      } else if (hasBTC && appKitBtcConfig) {
        // If only BTC is enabled, initialize with BTC only
        initializeAppKitBtcModal({
          ...appKitBtcConfig,
          themeMode: theme === "dark" ? "dark" : "light",
        });
      }
    } catch (error) {
      console.error("Failed to initialize AppKit modal:", error);
    }
  }, [config, theme, appKitConfig, appKitBtcConfig]);

  // Listen for requests to open the AppKit modals (triggered by connectors)
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
