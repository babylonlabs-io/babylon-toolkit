import { useMemo, type PropsWithChildren, type ReactNode } from "react";

import { WalletDialog } from "@/components/WalletProvider/components/WalletDialog";
import { ONE_HOUR } from "@/constants";
import { ChainProvider, type ChainMetadataMap } from "@/context/Chain.context";
import { LifeCycleHooksProvider, type LifeCycleHooksProps } from "@/context/LifecycleHooks.context";
import { createAccountStorage } from "@/core/storage";
import type { ChainId, ETHConfig } from "@/core/types";
import ethMetadata from "@/core/wallets/eth";
import { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/eth/appkit/modal";
import { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";
import type { ETHChainConfigArr } from "@/utils/ethConfigBuilder";

const metadata: ChainMetadataMap = { ETH: ethMetadata };

export interface WalletProviderProps {
  ttl?: number;
  persistent?: boolean;
  lifecycleHooks?: LifeCycleHooksProps;
  /** Object wallet detection reads its globals off. Defaults to `window` in the browser and `{}` on the server. */
  context?: Window | Record<string, unknown>;
  config: Readonly<ETHChainConfigArr>;
  onError?: (e: Error) => void;
  disabledWallets?: string[];
  /** Defaults to the configured Ethereum chain. Pass an empty list for a wallet-optional shell. */
  requiredChains?: readonly Extract<ChainId, "ETH">[];
  appKitConfig?: AppKitModalConfig;
  dialogActions?: ReactNode;
  dialogCloseButtonClassName?: string;
  dialogActionsClassName?: string;
}

/**
 * Wallet-dialog shell for Ethereum-only consumers. Its static module graph
 * carries no Bitcoin metadata, adapters, cryptography or wallet SDKs, so a
 * product that never offers Bitcoin does not ship any.
 */
export function WalletProvider({
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
}: PropsWithChildren<WalletProviderProps>) {
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
      initializeAppKitModal(appKitConfig);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Failed to initialize the Ethereum AppKit modal"));
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
