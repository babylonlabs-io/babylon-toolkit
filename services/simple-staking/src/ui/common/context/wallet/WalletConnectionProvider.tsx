import {
  WalletProvider,
  createWalletConfig,
} from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import { useCallback, type PropsWithChildren } from "react";
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
      if (error?.message?.includes("rejected")) {
        return;
      }

      const clientError = new ClientError(
        ERROR_CODES.WALLET_ACTION_FAILED,
        "Error connecting to wallet",
        { cause: error as Error },
      );
      logger.error(clientError);
      handleError({
        error: clientError,
      });
    },
    [handleError, logger],
  );

  const requiredChains: ("BBN" | "BTC" | "ETH")[] =
    location.pathname.startsWith("/baby")
      ? ["BBN"]
      : location.pathname.startsWith("/vault")
        ? ["BTC", "ETH"]
        : ["BTC", "BBN"];

  const config = createWalletConfig({
    chains: requiredChains,
    networkConfigs: {
      BTC: getNetworkConfigBTC(),
      BBN: getNetworkConfigBBN(),
      ETH: getNetworkConfigETH(),
    },
  });

  return (
    <WalletProvider
      persistent
      theme={theme}
      config={config}
      context={context}
      onError={onError}
      disabledWallets={FeatureFlagService.IsLedgerEnabled ? [] : ["ledget_btc"]}
      requiredChains={requiredChains}
    >
      {children}
    </WalletProvider>
  );
};
