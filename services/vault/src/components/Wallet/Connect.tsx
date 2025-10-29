import {
  Avatar,
  AvatarGroup,
  ConnectButton,
  WalletMenu,
} from "@babylonlabs-io/core-ui";
import {
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useBTCWallet, useETHWallet } from "../../context/wallet";

interface ConnectProps {
  loading?: boolean;
}

export const Connect: React.FC<ConnectProps> = ({ loading = false }) => {
  const { open, disconnect } = useWalletConnect();
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);

  const {
    connected: btcConnected,
    address: btcAddress,
    publicKeyNoCoord,
  } = useBTCWallet();
  const { connected: ethConnected, address: ethAddress } = useETHWallet();
  const { selectedWallets } = useWidgetState();

  const isConnected = useMemo(
    () => btcConnected && ethConnected,
    [btcConnected, ethConnected],
  );

  const transformedWallets = useMemo(() => {
    const result: Record<string, { name: string; icon: string }> = {};
    Object.entries(selectedWallets).forEach(([key, wallet]) => {
      if (wallet) {
        result[key] = { name: wallet.name, icon: wallet.icon };
      }
    });
    return result;
  }, [selectedWallets]);

  const handleOpenChange = (open: boolean) => {
    setIsWalletMenuOpen(open);
  };

  // Show WalletMenu when connected
  if (isConnected) {
    return (
      <div className="flex flex-row items-center gap-4">
        <WalletMenu
          trigger={
            <div className="cursor-pointer">
              <AvatarGroup max={3} variant="circular">
                {selectedWallets["BTC"] && (
                  <Avatar
                    alt={selectedWallets["BTC"]?.name}
                    url={selectedWallets["BTC"]?.icon}
                    size="large"
                    className={twMerge(
                      "box-content bg-accent-contrast object-contain",
                      isWalletMenuOpen &&
                        "outline outline-[2px] outline-accent-primary",
                    )}
                  />
                )}
                {selectedWallets["ETH"] && (
                  <Avatar
                    alt={selectedWallets["ETH"]?.name}
                    url={selectedWallets["ETH"]?.icon}
                    size="large"
                    className={twMerge(
                      "box-content bg-accent-contrast object-contain",
                      isWalletMenuOpen &&
                        "outline outline-[2px] outline-accent-primary",
                    )}
                  />
                )}
              </AvatarGroup>
            </div>
          }
          btcAddress={btcAddress}
          bbnAddress="" // Vault doesn't use BBN
          ethAddress={ethAddress}
          selectedWallets={transformedWallets}
          ordinalsExcluded={false}
          linkedDelegationsVisibility={false}
          onIncludeOrdinals={() => {}}
          onExcludeOrdinals={() => {}}
          onDisplayLinkedDelegations={() => {}}
          publicKeyNoCoord={publicKeyNoCoord}
          onDisconnect={disconnect}
          onOpenChange={handleOpenChange}
        />
      </div>
    );
  }

  return (
    <ConnectButton connected={isConnected} loading={loading} onClick={open} />
  );
};
