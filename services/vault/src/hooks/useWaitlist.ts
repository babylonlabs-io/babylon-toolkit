import {
  useChainConnector,
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector/btc-eth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAaveConfig } from "@/applications/aave/context";
import { resolveDisplayWallets } from "@/components/Wallet/resolveDisplayWallets";
import { FeatureFlags } from "@/config";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useConnection, useETHWallet } from "@/context/wallet";
import { toCheckedAddress } from "@/utils/addressUtils";

import {
  DEPOSITOR_ALLOWED_QUERY_KEY,
  useDepositorAllowed,
} from "./useDepositorAllowed";

export function useWaitlist(depositOpen: boolean) {
  const { config } = useAaveConfig();
  const { isConnected, ethConnected, btcConnected } = useConnection();
  const { address } = useETHWallet();
  const { visible, chains, selectedWallets } = useWidgetState();
  const ethConnector = useChainConnector("ETH");
  const btcConnector = useChainConnector("BTC");
  const { open } = useWalletConnect();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [readyFor, setReadyFor] = useState<string>();
  const application = config?.adapterAddress ?? "";
  const allowed = useDepositorAllowed(
    application,
    isConnected ? address : undefined,
    false,
  );

  const app = toCheckedAddress(application);
  const account = isConnected ? toCheckedAddress(address) : undefined;
  const connection =
    app === undefined || account === undefined
      ? undefined
      : `${app}:${account}`;

  useEffect(() => {
    setDismissed(false);
    if (app === undefined || account === undefined) {
      setReadyFor(undefined);
      return;
    }
    const queryKey = [DEPOSITOR_ALLOWED_QUERY_KEY, app, account];
    if (queryClient.getQueryState(queryKey)?.status === "success") {
      void queryClient.resetQueries({ queryKey, exact: true });
    }
    setReadyFor(`${app}:${account}`);
  }, [app, account, queryClient]);

  const wallets = resolveDisplayWallets({
    selectedWallets,
    ethConnected,
    btcConnected,
    ethConnector,
    btcConnector,
  });

  return {
    show:
      connection !== undefined &&
      readyFor === connection &&
      allowed === false &&
      !visible &&
      !depositOpen &&
      !dismissed,
    address,
    chainIcon: chains.ETH?.icon,
    wallet: wallets.ETH,
    fallbackIcon: ethConnector?.icon,
    formUrl: FeatureFlags.waitlistFormUrl,
    emailUrl: SOCIAL_LINKS.find((link) => link.name === "Email")?.url,
    dismiss: () => setDismissed(true),
    switchWallet: () => open(),
  };
}
