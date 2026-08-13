import { useMemo, type PropsWithChildren, type ReactNode } from "react";

import { WalletDialog } from "@/components/WalletProvider/components/WalletDialog";
import { ONE_HOUR } from "@/constants";
import { ChainProvider, type ChainMetadataMap } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { createAccountStorage } from "@/core/storage";
import type { ChainId, ETHConfig } from "@/core/types";
import ethMetadata from "@/core/wallets/eth";
import { initializeETHAppKitModal, type ETHAppKitModalConfig } from "@/core/wallets/eth/appkit/modal";
import { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";
import type { ETHChainConfigArr } from "@/utils/ethConfigBuilder";

const metadata: ChainMetadataMap = { ETH: ethMetadata };

export interface ETHWalletConnectorProviderProps {
  ttl?: number;
  persistent?: boolean;
  lifecycleHooks?: LifeCycleHooksProps;
  /** Object wallet detection reads its globals off. Defaults to `window` in the browser and `{}` on the server. */
  context?: Window | Record<string, unknown>;
  config: Readonly<ETHChainConfigArr>;
  onError?: (e: Error) => void;
  disabledWallets?: string[];
  /** Defaults to the configured ETH chain. Pass an empty list for a wallet-optional shell. */
  requiredChains?: readonly Extract<ChainId, "ETH">[];
  appKitConfig?: ETHAppKitModalConfig;
  dialogActions?: ReactNode;
  dialogCloseButtonClassName?: string;
  dialogActionsClassName?: string;
}

/**
 * Complete wallet-dialog shell for Ethereum-only consumers. Its static module
 * graph contains no Bitcoin metadata, adapters, cryptography, or wallet SDKs.
 */
export function ETHWalletConnectorProvider({
  ttl = ONE_HOUR,
  persistent = false,
  lifecycleHooks,
  children,
  config,
  context,
  onError,
  disabledWallets = [],
  requiredChains,
  appKitConfig,
  dialogActions,
  dialogCloseButtonClassName,
  dialogActionsClassName,
}: PropsWithChildren<ETHWalletConnectorProviderProps>) {
  const walletContext = context ?? (typeof window === "undefined" ? {} : window);
  const networkMap = useMemo(
    () =>
      config.reduce<Record<string, string>>((map, entry) => {
        map.ETH = (entry.config as ETHConfig).chainId.toString();
        return map;
      }, {}),
    [config],
  );
  const storage = useMemo(() => createAccountStorage(ttl, networkMap), [ttl, networkMap]);

  useMemo(() => {
    if (!appKitConfig) return;
    try {
      initializeETHAppKitModal(appKitConfig);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Failed to initialize ETH AppKit modal"));
    }
  }, [appKitConfig, onError]);

  useAppKitOpenListener();

  return (
    <LifeCycleHooksProvider value={lifecycleHooks}>
      <ChainProvider
        persistent={persistent}
        storage={storage}
        context={walletContext}
        config={config}
        onError={onError}
        disabledWallets={disabledWallets}
        requiredChains={requiredChains}
        metadata={metadata}
      >
        {children}
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
}
