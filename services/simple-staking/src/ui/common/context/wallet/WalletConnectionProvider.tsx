import {
  WalletProvider,
  createWalletConfig,
  type AppKitBtcModalConfig,
} from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import { useCallback, useMemo, type PropsWithChildren } from "react";
import { useLocation } from "react-router";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { getNetworkConfigETH } from "@/ui/common/config/network/eth";
import { ClientError, ERROR_CODES } from "@/ui/common/errors";
import { useLogger } from "@/ui/common/hooks/useLogger";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { useError } from "../Error/ErrorProvider";

const context = typeof window !== "undefined" ? window : {};

export const WalletConnectionProvider = ({ children }: PropsWithChildren) => {
  const { handleError } = useError();
  const { theme } = useTheme();
  const logger = useLogger();
  const location = useLocation();

  const onError = useCallback(
    (error: Error) => {
      const message = error?.message ?? "Error connecting to wallet";

      if (message.toLowerCase().includes("rejected")) {
        return;
      }

      const isCustomChainUnsupported =
        message.toLowerCase().includes("no chain info") ||
        message.toLowerCase().includes("not supported chainid");

      const errorMessage = isCustomChainUnsupported
        ? "This wallet doesn't support custom chains, please choose Keplr or Leap wallet and approve the custom chain in the wallet."
        : message;

      const clientError = new ClientError(
        ERROR_CODES.WALLET_ACTION_FAILED,
        errorMessage,
        { cause: error },
      );
      logger.error(clientError);
      handleError({
        error: clientError,
      });
    },
    [handleError, logger],
  );

  const requiredChains: ("BBN" | "BTC" | "ETH")[] = useMemo(
    () =>
      location.pathname.startsWith("/baby")
        ? ["BBN"]
        : location.pathname.startsWith("/vault")
          ? ["BTC", "ETH"]
          : ["BTC", "BBN"],
    [location.pathname],
  );

  const config = useMemo(
    () =>
      createWalletConfig({
        chains: requiredChains,
        networkConfigs: {
          BTC: getNetworkConfigBTC(),
          BBN: getNetworkConfigBBN(),
          ETH: getNetworkConfigETH(),
        },
      }),
    [requiredChains],
  );

  const disabledWallets = useMemo(() => {
    const disabled: string[] = [];

    // Disable Ledger BTC if feature flag is not enabled
    if (!FeatureFlagService.IsLedgerEnabled) {
      disabled.push("ledget_btc");
    }

    // Disable AppKit BTC on mainnet (not mature enough for production)
    // Keep it enabled on testnet/signet for testing
    const isMainnet = process.env.NEXT_PUBLIC_NETWORK === "mainnet";
    if (isMainnet) {
      disabled.push("appkit-btc-connector");
    }

    return disabled;
  }, []);

  const appKitBtcConfig: AppKitBtcModalConfig = useMemo(
    () => ({
      metadata: {
        name: "Babylon Staking",
        description: "Babylon Bitcoin Staking Platform",
        url:
          typeof window !== "undefined"
            ? window.location.origin
            : "https://btcstaking.babylonlabs.io",
        icons: [
          typeof window !== "undefined"
            ? `${window.location.origin}/favicon.ico`
            : "https://btcstaking.babylonlabs.io/favicon.ico",
        ],
      },
      network:
        getNetworkConfigBTC().network === "mainnet" ? "mainnet" : "signet",
    }),
    [],
  );

  return (
    <WalletProvider
      persistent
      theme={theme}
      config={config}
      context={context}
      onError={onError}
      disabledWallets={disabledWallets}
      requiredChains={requiredChains}
      appKitBtcConfig={appKitBtcConfig}
    >
      {children}
    </WalletProvider>
  );
};
