import {
  Avatar,
  AvatarGroup,
  BtcEthWalletMenu,
  ConnectButton,
  Hint,
} from "@babylonlabs-io/core-ui";
import {
  useChainConnector,
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";

import { useAddressScreening } from "@/context/addressScreening";
import { useGeoFencing } from "@/context/geofencing";
import { COPY } from "@/copy";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { useAppState } from "../../state/AppState";

import { resolveDisplayWallets } from "./resolveDisplayWallets";

interface ConnectProps {
  loading?: boolean;
  /** Override the default `ConnectButton` label (e.g. "Connect Wallet" for in-page CTAs). */
  text?: string;
}

export const Connect: React.FC<ConnectProps> = ({ loading = false, text }) => {
  const { open, disconnect } = useWalletConnect();

  const {
    connected: btcConnected,
    address: btcAddress,
    publicKeyNoCoord,
  } = useBTCWallet();
  const { connected: ethConnected, address: ethAddress } = useETHWallet();
  const { selectedWallets } = useWidgetState();
  const btcConnector = useChainConnector("BTC");
  const ethConnector = useChainConnector("ETH");
  const { includeOrdinals, excludeOrdinals, ordinalsExcluded } = useAppState();

  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const { isBlocked: isAddressBlocked, isLoading: isScreeningLoading } =
    useAddressScreening();

  const isWalletConnected = btcConnected && ethConnected;

  // Icon source must stay aligned with the (provider-level) connection state:
  // `selectedWallets` is volatile widget state that can lag a reconnect on
  // refresh, leaving the address shown but the icon blank. resolveDisplayWallets
  // falls back to the connector's connected/installed wallet metadata.
  const displayWallets = useMemo(
    () =>
      resolveDisplayWallets({
        selectedWallets,
        btcConnected,
        ethConnected,
        btcConnector,
        ethConnector,
      }),
    [selectedWallets, btcConnected, ethConnected, btcConnector, ethConnector],
  );

  // Show BtcEthWalletMenu when wallets are connected and not geo-blocked.
  // Address-blocked users still need the menu to disconnect and try a different wallet.
  if (isWalletConnected && !isGeoBlocked && !isGeoLoading) {
    return (
      <div className="flex flex-row items-center gap-4">
        <BtcEthWalletMenu
          trigger={
            <div className="cursor-pointer">
              <AvatarGroup max={3} variant="rounded" className="!-space-x-0.5">
                {displayWallets["BTC"] && (
                  <Avatar
                    alt={displayWallets["BTC"].name}
                    url={displayWallets["BTC"].icon}
                    size="medium"
                    className="box-content !overflow-visible object-contain"
                  />
                )}
                {displayWallets["ETH"] && (
                  <Avatar
                    alt={displayWallets["ETH"].name}
                    url={displayWallets["ETH"].icon}
                    size="medium"
                    className="box-content !overflow-visible object-contain"
                  />
                )}
              </AvatarGroup>
            </div>
          }
          btcAddress={btcAddress}
          ethAddress={ethAddress}
          selectedWallets={displayWallets}
          publicKeyNoCoord={publicKeyNoCoord}
          ordinalsExcluded={ordinalsExcluded}
          onIncludeOrdinals={includeOrdinals}
          onExcludeOrdinals={excludeOrdinals}
          btcCoinSymbol="BTC"
          ethCoinSymbol="ETH"
          onDisconnect={disconnect}
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
      text={text}
    />
  );

  if (isGeoBlocked) {
    return (
      <Hint tooltip={COPY.wallet.geoBlockedTooltip} attachToChildren>
        <span>{connectButton}</span>
      </Hint>
    );
  }

  if (isAddressBlocked) {
    return (
      <Hint tooltip={COPY.wallet.walletNotEligibleTooltip} attachToChildren>
        <span>{connectButton}</span>
      </Hint>
    );
  }

  return connectButton;
};
