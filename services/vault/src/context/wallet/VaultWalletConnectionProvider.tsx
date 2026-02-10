import {
  getNetworkConfigBTC,
  getNetworkConfigETH,
} from "@babylonlabs-io/config";
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

  // When BTC wallet disconnects, disconnect all wallets
  const btcCallbacks = useMemo(
    () => ({
      onDisconnect: () => {
        if (isDisconnectingRef.current) return;
        isDisconnectingRef.current = true;
        try {
          disconnectAll?.();
        } finally {
          isDisconnectingRef.current = false;
        }
      },
    }),
    [disconnectAll],
  );

  // When ETH wallet disconnects, disconnect all wallets
  const ethCallbacks = useMemo(
    () => ({
      onDisconnect: () => {
        if (isDisconnectingRef.current) return;
        isDisconnectingRef.current = true;
        try {
          disconnectAll?.();
        } finally {
          isDisconnectingRef.current = false;
        }
      },
    }),
    [disconnectAll],
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
    const disabled: string[] = ["ledger_btc", "ledger_btc_v2"];

    const isMainnet = process.env.NEXT_PUBLIC_BTC_NETWORK === "mainnet";

    // Disable AppKit BTC on mainnet
    if (isMainnet) {
      disabled.push(APPKIT_BTC_CONNECTOR_ID);
    }

    return disabled;
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
    // Log non-rejection errors for debugging
    console.error("Wallet connection error:", error);
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
    >
      <WalletProviders>{children}</WalletProviders>
    </WalletProvider>
  );
};
