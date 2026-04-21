import {
  getNetworkConfigBTC,
  getNetworkConfigETH,
} from "@babylonlabs-io/config";
import {
  BTCWalletProvider,
  ETHWalletProvider,
  WalletProvider,
  createWalletConfig,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import { useCallback, useMemo, useRef, type PropsWithChildren } from "react";

import featureFlags from "@/config/featureFlags";
import { logger } from "@/infrastructure";

const context = typeof window !== "undefined" ? window : {};

const SUPPORTED_EXTERNAL_WALLETS = [
  "bitcoin_okx",
  "bitcoin_unisat",
  "bitcoin_keplr",
  "cosmos_okx",
  "cosmos_unisat",
  "cosmos_keplr",
];

/**
 * Component that provides wallet-specific providers with cross-disconnect logic
 */
function WalletProviders({ children }: PropsWithChildren) {
  const { disconnect: disconnectAll } = useWalletConnect();
  // Guard against re-entrancy when disconnectAll triggers disconnect events
  const isDisconnectingRef = useRef(false);

  const handleWalletReset = useCallback(async () => {
    if (isDisconnectingRef.current) return;
    isDisconnectingRef.current = true;
    try {
      await disconnectAll?.();
    } finally {
      isDisconnectingRef.current = false;
    }
  }, [disconnectAll]);

  // When BTC wallet disconnects or changes account, disconnect all wallets
  const btcCallbacks = useMemo(
    () => ({
      onDisconnect: handleWalletReset,
      onAddressChange: handleWalletReset,
    }),
    [handleWalletReset],
  );

  // When ETH wallet disconnects or changes account, disconnect all wallets
  const ethCallbacks = useMemo(
    () => ({
      onDisconnect: handleWalletReset,
      onAddressChange: handleWalletReset,
    }),
    [handleWalletReset],
  );

  return (
    <BTCWalletProvider callbacks={btcCallbacks}>
      <ETHWalletProvider callbacks={ethCallbacks}>{children}</ETHWalletProvider>
    </BTCWalletProvider>
  );
}

/**
 * WalletConnectionProvider
 *
 * NOTE: AppKit modal initialization is now handled in @/config/wagmi.ts
 * to ensure wagmi config is created before the app renders.
 */
export const WalletConnectionProvider = ({ children }: PropsWithChildren) => {
  const { theme } = useTheme();

  const disabledWallets = useMemo(() => {
    return ["ledger_btc", "ledger_btc_v2"];
  }, []);

  const config = useMemo(
    () =>
      createWalletConfig({
        chains: ["BTC", "ETH"],
        networkConfigs: {
          BTC: getNetworkConfigBTC(),
          ETH: getNetworkConfigETH(),
        },
        supportedWallets: SUPPORTED_EXTERNAL_WALLETS,
      }),
    [],
  );

  const onError = useCallback((error: Error) => {
    // User rejections are expected, don't log them
    if (error?.message?.includes("rejected")) {
      return;
    }
    logger.error(error, { data: { context: "Wallet connection error" } });
  }, []);

  return (
    <WalletProvider
      persistent
      theme={theme}
      config={config}
      context={context}
      onError={onError}
      disabledWallets={disabledWallets}
      requiredChains={["BTC", "ETH"]}
      simplifiedTerms={featureFlags.isSimplifiedTermsEnabled}
    >
      <WalletProviders>{children}</WalletProviders>
    </WalletProvider>
  );
};
