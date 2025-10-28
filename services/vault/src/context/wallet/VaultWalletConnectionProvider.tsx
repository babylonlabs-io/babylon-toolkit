import {
  getNetworkConfigBTC,
  getNetworkConfigETH,
} from "@babylonlabs-io/config";
import {
  WalletProvider,
  createWalletConfig,
} from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import { useCallback, useMemo, type PropsWithChildren } from "react";

const context = typeof window !== "undefined" ? window : {};

export const VaultWalletConnectionProvider = ({
  children,
}: PropsWithChildren) => {
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
    >
      {children}
    </WalletProvider>
  );
};
