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
import { useCallback, useMemo, type PropsWithChildren } from "react";

const context = typeof window !== "undefined" ? window : {};

/**
 * Component that provides wallet-specific providers with cross-disconnect logic
 */
function WalletProviders({ children }: PropsWithChildren) {
  const { disconnect: disconnectAll } = useWalletConnect();

  // When BTC wallet disconnects, disconnect all wallets
  const btcCallbacks = useMemo(
    () => ({
      onDisconnect: () => {
        disconnectAll?.();
      },
    }),
    [disconnectAll],
  );

  // When ETH wallet disconnects, disconnect all wallets
  const ethCallbacks = useMemo(
    () => ({
      onDisconnect: () => {
        disconnectAll?.();
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

  const config = useMemo(
    () =>
      createWalletConfig({
        chains: ["BTC", "ETH"],
        networkConfigs: {
          BTC: getNetworkConfigBTC(),
          ETH: getNetworkConfigETH(),
        },
      }),
    [],
  );

  const disabledWallets = useMemo(() => {
    const disabled: string[] = [];

    const isMainnet = process.env.NEXT_PUBLIC_BTC_NETWORK === "mainnet";

    // Disable Ledger BTC on mainnet
    if (isMainnet) {
      disabled.push("ledger_btc");
    }

    // Disable AppKit BTC on mainnet
    if (isMainnet) {
      disabled.push(APPKIT_BTC_CONNECTOR_ID);
    }

    return disabled;
  }, []);

  const onError = useCallback((error: Error) => {
    if (error?.message?.includes("rejected")) {
      return;
    }
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
