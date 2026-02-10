import {
  Avatar,
  AvatarGroup,
  BtcEthWalletMenu,
  ConnectButton,
} from "@babylonlabs-io/core-ui";
import {
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useGeoFencing } from "@/context/geofencing";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { useAppState } from "../../state/AppState";

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
  const { includeOrdinals, excludeOrdinals, ordinalsExcluded } = useAppState();

  const { isGeoBlocked } = useGeoFencing();

  const isConnected = useMemo(
    () => btcConnected && ethConnected && !isGeoBlocked,
    [btcConnected, ethConnected, isGeoBlocked],
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

  // Show BtcEthWalletMenu when connected
  if (isConnected) {
    return (
      <div className="flex flex-row items-center gap-4">
        <BtcEthWalletMenu
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
          ethAddress={ethAddress}
          selectedWallets={transformedWallets}
          publicKeyNoCoord={publicKeyNoCoord}
          ordinalsExcluded={ordinalsExcluded}
          onIncludeOrdinals={includeOrdinals}
          onExcludeOrdinals={excludeOrdinals}
          btcCoinSymbol="BTC"
          ethCoinSymbol="ETH"
          onDisconnect={disconnect}
          onOpenChange={handleOpenChange}
        />
      </div>
    );
  }

  return (
    <ConnectButton
      connected={isConnected}
      loading={loading || isGeoBlocked}
      onClick={open}
    />
  );
};
