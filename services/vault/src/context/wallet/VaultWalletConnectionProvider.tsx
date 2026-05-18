import {
  APPKIT_BTC_CONNECTOR_ID,
  BTCWalletProvider,
  ETHWalletProvider,
  WalletProvider,
  createWalletConfig,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import { useCallback, useMemo, useRef, type PropsWithChildren } from "react";

import { getNetworkConfigBTC } from "@/config";
import featureFlags from "@/config/featureFlags";
import { getNetworkConfigETH } from "@/config/network";
import { logger } from "@/infrastructure";

// Vault deposits require the connected BTC wallet to implement the
// `deriveContextHash` API (see docs/specs/derive-context-hash.md). Only
// UniSat exposes a conformant implementation today, so every other BTC
// adapter is gated off here. Re-enable an entry as soon as its wallet
// vendor ships `deriveContextHash`. Each non-conforming adapter still
// throws `WALLET_METHOD_NOT_SUPPORTED` at the connector layer; this
// list just keeps them out of the connection UI in the first place so
// users don't pick something that can't complete a deposit.
//
// In e2e mode we keep `"injectable"` enabled so Playwright can install
// a `window.btcwallet` mock that does expose `deriveContextHash`. The
// gate flips at build time via Vite's `NEXT_PUBLIC_E2E_MODE`; a
// production build never sets this var, so users still see only the
// UniSat-and-friends list.
const IS_E2E_MODE = process.env.NEXT_PUBLIC_E2E_MODE === "1";
const DISABLED_WALLETS: string[] = [
  APPKIT_BTC_CONNECTOR_ID,
  ...(IS_E2E_MODE ? [] : ["injectable"]),
  "keystone",
  "ledger_btc",
  "ledger_btc_v2",
  "okx",
  "onekey",
];

const context = typeof window !== "undefined" ? window : {};

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

  const config = useMemo(
    () =>
      createWalletConfig({
        chains: ["BTC", "ETH"],
        networkConfigs: {
          BTC: getNetworkConfigBTC(),
          ETH: getNetworkConfigETH(),
        },
        disableTomo: true,
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
      disabledWallets={DISABLED_WALLETS}
      requiredChains={["BTC", "ETH"]}
      simplifiedTerms={featureFlags.isSimplifiedTermsEnabled}
      disableTomo
    >
      <WalletProviders>{children}</WalletProviders>
    </WalletProvider>
  );
};
