import { ConnectButton } from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";

import { useBTCWallet, useETHWallet } from "../../context/wallet";

interface ConnectProps {
  loading?: boolean;
}

export const Connect: React.FC<ConnectProps> = ({ loading = false }) => {
  const { open } = useWalletConnect();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();

  const isConnected = useMemo(
    () => btcConnected && ethConnected,
    [btcConnected, ethConnected],
  );

  return (
    <ConnectButton connected={isConnected} loading={loading} onClick={open} />
  );
};
