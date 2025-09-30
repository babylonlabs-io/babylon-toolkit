import {
  Avatar,
  AvatarGroup,
  Button,
  WalletMenu,
} from "@babylonlabs-io/core-ui";
import {
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";
import { PiWalletBold } from "react-icons/pi";
import { useLocation } from "react-router";
import { twMerge } from "tailwind-merge";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useETHWallet } from "@/ui/common/context/wallet/ETHWalletProvider";
import { useUTXOs } from "@/ui/common/hooks/client/api/useUTXOs";
import { useHealthCheck } from "@/ui/common/hooks/useHealthCheck";
import { useAppState } from "@/ui/common/state";
import { useBalanceState } from "@/ui/common/state/BalanceState";
import { useDelegationV2State } from "@/ui/common/state/DelegationV2State";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { formatBalance } from "@/ui/common/utils/formatCryptoBalance";

import { SettingMenuWrapper } from "../Menu/SettingMenu";

interface ConnectProps {
  loading?: boolean;
  onConnect: () => void;
}

export const Connect: React.FC<ConnectProps> = ({
  loading = false,
  onConnect,
}) => {
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const handleOpenChange = (open: boolean) => {
    setIsWalletMenuOpen(open);
  };

  const location = useLocation();
  const isBabyRoute = location.pathname.startsWith("/baby");
  const isVaultRoute = location.pathname.startsWith("/vault");

  // App state and wallet context
  const { includeOrdinals, excludeOrdinals, ordinalsExcluded } = useAppState();
  const { linkedDelegationsVisibility, displayLinkedDelegations } =
    useDelegationV2State();

  // Balance state
  const {
    bbnBalance,
    stakableBtcBalance,
    stakedBtcBalance,
    inscriptionsBtcBalance,
    loading: isBalanceLoading,
  } = useBalanceState();

  // UTXO data for unconfirmed transactions check
  const { allUTXOs = [], confirmedUTXOs = [] } = useUTXOs();
  const hasUnconfirmedUTXOs = allUTXOs.length > confirmedUTXOs.length;

  // Network configs for coin symbols
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const { coinSymbol: bbnCoinSymbol } = getNetworkConfigBBN();

  // Balance data for WalletMenu
  const btcBalances = {
    staked: stakedBtcBalance,
    stakable: stakableBtcBalance,
    inscriptions: inscriptionsBtcBalance,
  };

  const bbnBalances = {
    available: bbnBalance,
  };

  // Unified balance formatter
  const formatBalanceWithSymbol = (amount: number, coinSymbol: string) => {
    if (coinSymbol === btcCoinSymbol) {
      return formatBalance(satoshiToBtc(amount), coinSymbol);
    } else if (coinSymbol === bbnCoinSymbol) {
      return formatBalance(ubbnToBaby(amount), coinSymbol);
    }
    return formatBalance(amount, coinSymbol);
  };

  // Wallet states
  const {
    address: btcAddress,
    connected: btcConnected,
    publicKeyNoCoord,
  } = useBTCWallet();
  const { bech32Address, connected: bbnConnected } = useCosmosWallet();
  const { connected: ethConnected } = useETHWallet();

  // Widget states
  const { selectedWallets } = useWidgetState();
  const { disconnect } = useWalletConnect();

  const {
    isApiNormal,
    isGeoBlocked,
    isLoading: isHealthcheckLoading,
  } = useHealthCheck();

  const isConnected = useMemo(() => {
    if (isBabyRoute) {
      return bbnConnected && !isGeoBlocked && !isHealthcheckLoading;
    } else if (isVaultRoute) {
      return (
        btcConnected && ethConnected && !isGeoBlocked && !isHealthcheckLoading
      );
    } else {
      return (
        btcConnected && bbnConnected && !isGeoBlocked && !isHealthcheckLoading
      );
    }
  }, [
    isBabyRoute,
    isVaultRoute,
    btcConnected,
    bbnConnected,
    ethConnected,
    isGeoBlocked,
    isHealthcheckLoading,
  ]);

  const isLoading = useMemo(() => {
    // Only disable the button if we're already connected, API is down, or there's an active connection process
    return isConnected || !isApiNormal || loading;
  }, [isConnected, isApiNormal, loading]);

  const transformedWallets = useMemo(() => {
    const result: Record<string, { name: string; icon: string }> = {};
    Object.entries(selectedWallets).forEach(([key, wallet]) => {
      if (wallet) {
        result[key] = { name: wallet.name, icon: wallet.icon };
      }
    });
    return result;
  }, [selectedWallets]);

  // DISCONNECTED STATE: Show connect button + settings menu
  if (!isConnected) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="large"
          className="h-[2.5rem] min-h-[2.5rem] rounded-full px-6 py-2 text-base text-white md:rounded"
          onClick={onConnect}
          disabled={isLoading}
          data-testid="connect-wallets-button"
        >
          <PiWalletBold size={20} className="flex md:hidden" />
          <span className="hidden md:flex">
            {isBabyRoute ? "Connect Wallet" : "Connect Wallets"}
          </span>
        </Button>

        <SettingMenuWrapper />
      </div>
    );
  }

  // CONNECTED STATE: Show wallet avatars + settings menu
  return (
    <div className="relative flex flex-row items-center gap-4">
      <WalletMenu
        trigger={
          <div className="cursor-pointer">
            <AvatarGroup max={3} variant="circular">
              {selectedWallets["BTC"] && !isBabyRoute ? (
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
              ) : null}
              {selectedWallets["BBN"] && !isVaultRoute ? (
                <Avatar
                  alt={selectedWallets["BBN"]?.name}
                  url={selectedWallets["BBN"]?.icon}
                  size="large"
                  className={twMerge(
                    "box-content bg-accent-contrast object-contain",
                    isWalletMenuOpen &&
                      "outline outline-[2px] outline-accent-primary",
                  )}
                />
              ) : null}
              {selectedWallets["ETH"] && isVaultRoute ? (
                <Avatar
                  alt={selectedWallets["ETH"]?.name || "Ethereum Wallet"}
                  url={selectedWallets["ETH"]?.icon || ""}
                  size="large"
                  className={twMerge(
                    "box-content bg-accent-contrast object-contain",
                    isWalletMenuOpen &&
                      "outline outline-[2px] outline-accent-primary",
                  )}
                />
              ) : null}
            </AvatarGroup>
          </div>
        }
        btcAddress={btcAddress}
        bbnAddress={bech32Address}
        selectedWallets={transformedWallets}
        ordinalsExcluded={ordinalsExcluded}
        linkedDelegationsVisibility={linkedDelegationsVisibility}
        onIncludeOrdinals={includeOrdinals}
        onExcludeOrdinals={excludeOrdinals}
        onDisplayLinkedDelegations={displayLinkedDelegations}
        publicKeyNoCoord={publicKeyNoCoord}
        onDisconnect={disconnect}
        onOpenChange={handleOpenChange}
        // Balance-related props
        btcBalances={btcBalances}
        bbnBalances={bbnBalances}
        balancesLoading={isBalanceLoading}
        hasUnconfirmedTransactions={hasUnconfirmedUTXOs}
        formatBalance={formatBalanceWithSymbol}
        btcCoinSymbol={btcCoinSymbol}
        bbnCoinSymbol={bbnCoinSymbol}
      />

      <SettingMenuWrapper />
    </div>
  );
};
