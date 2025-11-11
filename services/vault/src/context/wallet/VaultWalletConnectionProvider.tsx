import {
  getNetworkConfigBTC,
  getNetworkConfigETH,
} from "@babylonlabs-io/config";
import {
  BTCWalletProvider,
  ETHWalletProvider,
  WalletProvider,
  createWalletConfig,
  type AppKitModalConfig,
} from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import { useCallback, useMemo, type PropsWithChildren } from "react";

const context = typeof window !== "undefined" ? window : {};

/**
 * WalletConnectionProvider
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

  const appKitConfig: AppKitModalConfig = useMemo(
    () => ({
      projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
      metadata: {
        name: "Babylon Vault",
        description: "Babylon Vault - Secure Bitcoin Vault Platform",
        url:
          typeof window !== "undefined"
            ? window.location.origin
            : "https://staking.vault-devnet.babylonlabs.io",
        icons: [
          typeof window !== "undefined"
            ? `${window.location.origin}/favicon.ico`
            : "https://btcstaking.babylonlabs.io/favicon.ico",
        ],
      },
    }),
    [],
  );

  const onError = useCallback((error: Error) => {
    if (error?.message?.includes("rejected")) {
      return;
    }
    console.error("Wallet connection error:", error);
  }, []);

  return (
    <WalletProvider
      persistent
      theme={theme}
      config={config}
      context={context}
      onError={onError}
      requiredChains={["BTC", "ETH"]}
      appKitConfig={appKitConfig}
    >
      <BTCWalletProvider>
        <ETHWalletProvider>{children}</ETHWalletProvider>
      </BTCWalletProvider>
    </WalletProvider>
  );
};
