import {
  Avatar,
  AvatarGroup,
  BtcEthWalletMenu,
  ConnectButton,
  Hint,
} from "@babylonlabs-io/core-ui";
import {
  isUserRejectionMessage,
  useChainConnector,
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";

import { useAddressScreening } from "@/context/addressScreening";
import { useGeoFencing } from "@/context/geofencing";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";

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
    locked: btcLocked,
    reconnect: reconnectBtcWallet,
  } = useBTCWallet();
  const { connected: ethConnected, address: ethAddress } = useETHWallet();
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    try {
      // Re-runs the wallet's connect flow, surfacing the extension's unlock
      // prompt. On success the provider clears `locked` and this button reverts
      // to the connected wallet menu.
      await reconnectBtcWallet();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // User rejections are expected (they dismissed the prompt) — only report
      // genuine failures.
      if (!isUserRejectionMessage(err.message)) {
        logger.error(err, { data: { context: "Wallet unlock from navbar" } });
      }
    } finally {
      setIsUnlocking(false);
    }
  };
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

  // A silently locked BTC wallet keeps `connected` true (cached session), so it
  // would otherwise render the connected wallet menu. Surface an unlock button
  // in the navbar instead so the user can re-authorize in one click.
  if (btcLocked && !isGeoBlocked && !isGeoLoading) {
    return (
      <ConnectButton
        connected={false}
        loading={isUnlocking}
        onClick={handleUnlock}
        text={COPY.wallet.locked.unlockButton}
      />
    );
  }

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
