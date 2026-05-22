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
const DISABLED_WALLETS: string[] = [
  APPKIT_BTC_CONNECTOR_ID,
  "injectable",
  "keystone",
  "ledger_btc",
  "ledger_btc_v2",
  "okx",
  "onekey",
];

const context = typeof window !== "undefined" ? window : {};

// A late-injecting BTC extension (e.g. UniSat) can emit a transient
// `disconnect`/account-change event while its service worker wakes right after
// a page (re)load. Treating that blip as a real disconnect calls
// `disconnectAll()` and wipes the persisted session for BOTH wallets, forcing a
// full reconnect. Ignore wallet-reset events fired within this window of mount;
// genuine user disconnects and account switches happen later in active use, so
// they are unaffected. Sized to match the wallet-connector's injection fallback.
const WALLET_RESET_STABILIZATION_WINDOW_MS = 3000;

/**
 * Component that provides wallet-specific providers with cross-disconnect logic
 */
function WalletProviders({ children }: PropsWithChildren) {
  const { disconnect: disconnectAll } = useWalletConnect();
  // Guard against re-entrancy when disconnectAll triggers disconnect events
  const isDisconnectingRef = useRef(false);
  // Wall-clock time this provider mounted, used to ignore transient wallet
  // events during the post-(re)load re-injection window (see constant above).
  const mountedAtRef = useRef(Date.now());

  const handleWalletReset = useCallback(async () => {
    if (
      Date.now() - mountedAtRef.current <
      WALLET_RESET_STABILIZATION_WINDOW_MS
    ) {
      logger.info(
        "Ignoring wallet reset within post-load stabilization window",
        {
          category: "Wallet connection",
        },
      );
      return;
    }
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
