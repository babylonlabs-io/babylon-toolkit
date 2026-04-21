import {
  Avatar,
  AvatarGroup,
  BtcEthWalletMenu,
  ConnectButton,
  Hint,
} from "@babylonlabs-io/core-ui";
import {
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useAddressScreening } from "@/context/addressScreening";
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

  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const { isBlocked: isAddressBlocked, isLoading: isScreeningLoading } =
    useAddressScreening();

  const isWalletConnected = btcConnected && ethConnected;

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

  // Show BtcEthWalletMenu when wallets are connected and not geo-blocked.
  // Address-blocked users still need the menu to disconnect and try a different wallet.
  if (isWalletConnected && !isGeoBlocked && !isGeoLoading) {
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

  const connectButton = (
    <ConnectButton
      connected={false}
      loading={loading || isGeoLoading || isScreeningLoading}
      disabled={isGeoBlocked || isAddressBlocked}
      onClick={open}
    />
  );

  if (isGeoBlocked) {
    return (
      <Hint tooltip="Not available in your region" attachToChildren>
        <span>{connectButton}</span>
      </Hint>
    );
  }

  if (isAddressBlocked) {
    return (
      <Hint tooltip="Wallet not eligible" attachToChildren>
        <span>{connectButton}</span>
      </Hint>
    );
  }

  return connectButton;
};
