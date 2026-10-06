import {
  AvatarGroup,
  BtcEthWalletMenu,
  ConnectButton,
  Hint,
  type HintProps,
  WalletIcon,
  WalletMenu,
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
import { useBtcWalletUnlock } from "@/hooks/useBtcWalletUnlock";
import { useUTXOs } from "@/hooks/useUTXOs";

import {
  useBTCWallet,
  useConnection,
  useETHWallet,
} from "../../context/wallet";
import { useAppState } from "../../state/AppState";

import { shouldShowInscriptionsToggle } from "./inscriptionToggle";
import { resolveDisplayWallets } from "./resolveDisplayWallets";

interface ConnectProps {
  loading?: boolean;
  /** Override the default `ConnectButton` label (e.g. "Connect Wallet" for in-page CTAs). */
  text?: string;
  /** How a blocked reason shows on touch: text under the button, or a tap-to-open sheet where there is no room. */
  touchFallback?: HintProps["touchFallback"];
}

export const Connect: React.FC<ConnectProps> = ({
  loading = false,
  text,
  touchFallback = "text",
}) => {
  const { open, disconnect } = useWalletConnect();
  const { isConnected, btcConnected, ethConnected } = useConnection();
  const {
    address: btcAddress,
    publicKeyNoCoord,
    locked: btcLocked,
  } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();
  // Re-runs the wallet's connect flow, surfacing the extension's unlock prompt.
  // On success the provider clears `locked` and the menu drops its unlock entry.
  const { unlock: handleUnlock, isUnlocking } = useBtcWalletUnlock(
    "Wallet unlock from navbar",
  );
  const { selectedWallets } = useWidgetState();
  const btcConnector = useChainConnector("BTC");
  const ethConnector = useChainConnector("ETH");
  const { includeOrdinals, excludeOrdinals, ordinalsExcluded } = useAppState();

  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const {
    isBlocked: isAddressBlocked,
    isUnavailable: isScreeningUnavailable,
    isLoading: isScreeningLoading,
  } = useAddressScreening();

  // The page and menu use the same confirmed-session gate.
  const canShowWalletMenu = isConnected && !isGeoBlocked && !isGeoLoading;

  // Scope this subscription to when the menu can render; the query is shared
  // (same key) with the deposit form, so this only adds an observer.
  const utxoOptions = useMemo(
    () => ({ enabled: canShowWalletMenu && btcConnected && !btcLocked }),
    [canShowWalletMenu, btcConnected, btcLocked],
  );
  const { inscriptionUTXOs } = useUTXOs(
    btcConnected && !btcLocked ? btcAddress : undefined,
    utxoOptions,
  );
  // While ordinals are loading or errored, useUTXOs reports 0 inscriptions, so
  // the toggle stays hidden then — fine, toggling is a no-op until it resolves.
  const showInscriptionsToggle =
    btcConnected &&
    !btcLocked &&
    shouldShowInscriptionsToggle(inscriptionUTXOs.length, ordinalsExcluded);

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

  // Show the wallet menu (BtcEthWalletMenu once Bitcoin is connected too) when
  // the session is connected and not geo-blocked.
  // Address-blocked users still need the menu to disconnect and try a different wallet.
  if (canShowWalletMenu) {
    const ConnectedWalletMenu = btcConnected ? BtcEthWalletMenu : WalletMenu;
    // A locked BTC wallet keeps the menu (the Ethereum session stays usable),
    // so the unlock entry lives inside the menu.
    const unlockAction = btcLocked
      ? {
          label: isUnlocking
            ? COPY.wallet.locked.unlocking
            : COPY.wallet.locked.unlockButton,
          onClick: handleUnlock,
          "data-testid": "wallet-menu-unlock",
        }
      : undefined;
    return (
      <div className="flex flex-row items-center gap-4">
        <ConnectedWalletMenu
          trigger={
            // This control's data-testid is a real-wallet E2E hook
            // (e2e/real/actions/walletConnect.ts, e2e/real/actions/resume.ts) —
            // carry it over if you move or rename the element. It renders only
            // once the required session is confirmed, on every route, so the harness
            // uses it as its route-independent "connected" signal. resume.ts also
            // counts its wallet icons (one per connected chain) to tell whether
            // Bitcoin is back, so keep one icon per chain.
            <button
              type="button"
              aria-label={COPY.wallet.menuTrigger}
              className="flex cursor-pointer"
              data-testid="wallet-menu-trigger"
            >
              <AvatarGroup max={3} className="!-space-x-2">
                {displayWallets["BTC"] && (
                  <WalletIcon
                    alt={displayWallets["BTC"].name}
                    url={displayWallets["BTC"].icon}
                    background={displayWallets["BTC"].iconBackground}
                  />
                )}
                {displayWallets["ETH"] && (
                  <WalletIcon
                    alt={displayWallets["ETH"].name}
                    url={displayWallets["ETH"].icon}
                    background={displayWallets["ETH"].iconBackground}
                  />
                )}
              </AvatarGroup>
            </button>
          }
          btcAddress={btcConnected ? btcAddress : undefined}
          ethAddress={ethAddress}
          selectedWallets={displayWallets}
          publicKeyNoCoord={publicKeyNoCoord}
          ordinalsExcluded={ordinalsExcluded}
          onIncludeOrdinals={includeOrdinals}
          onExcludeOrdinals={excludeOrdinals}
          showInscriptionsToggle={showInscriptionsToggle}
          btcCoinSymbol="BTC"
          ethCoinSymbol="ETH"
          onDisconnect={disconnect}
          connectAction={unlockAction}
          mobileMode="popover"
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
      <Hint
        tooltip={COPY.wallet.geoBlockedTooltip}
        attachToChildren
        touchFallback={touchFallback}
      >
        <span>{connectButton}</span>
      </Hint>
    );
  }

  if (isAddressBlocked) {
    return (
      <Hint
        tooltip={
          isScreeningUnavailable
            ? COPY.wallet.addressScreeningBanner.unavailableTitle
            : COPY.wallet.walletNotEligibleTooltip
        }
        attachToChildren
        touchFallback={touchFallback}
      >
        <span>{connectButton}</span>
      </Hint>
    );
  }

  return connectButton;
};
