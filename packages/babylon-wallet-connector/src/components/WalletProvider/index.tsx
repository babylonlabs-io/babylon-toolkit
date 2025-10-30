import { useMemo, type PropsWithChildren } from "react";

import { ChainConfigArr, ChainProvider } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { TomoConnectionProvider } from "@/context/TomoProvider";
import { createAccountStorage } from "@/core/storage";
import { TomoBBNConnector } from "@/widgets/tomo/BBNConnector";
import { TomoBTCConnector } from "@/widgets/tomo/BTCConnector";
import { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/eth/appkit/appKitModal";
import { useAppKitOpenListener } from "@/hooks/useAppKitOpenListener";

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
}: PropsWithChildren<WalletProviderProps>) {
  const storage = useMemo(() => createAccountStorage(ttl), [ttl]);

  // Initialize AppKit synchronously before render when ETH chain is enabled
  // This ensures wagmi config is available before children (ETHWalletProvider) mount
  useMemo(() => {
    try {
      const hasETH = config?.some((c) => c.chain === "ETH");
      if (hasETH && appKitConfig) {
        initializeAppKitModal({
          ...appKitConfig,
          themeMode: theme === "dark" ? "dark" : "light",
        });
      }
    } catch {
    }
  }, [config, theme, appKitConfig]);

  // Listen for requests to open the AppKit modal (triggered by ETH connector)
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
