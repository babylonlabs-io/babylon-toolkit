import React, { useState, useCallback } from "react";
import { Menu } from "../../../components/Menu";
import { WalletDisconnectButton } from "../../../components/Button";
import { WalletMenuCard, WalletBalanceData } from "./components/WalletMenuCard";
import { useCopy } from "../../../hooks/useCopy";
import { twJoin } from "tailwind-merge";

export type WalletChain = "BTC" | "BBN" | "ETH";

export interface WalletMenuProps {
  trigger: React.ReactNode;
  btcAddress?: string;
  bbnAddress?: string;
  ethAddress?: string;
  selectedWallets: Partial<Record<WalletChain, { name: string; icon: string }>>;
  onDisconnect: () => void;
  forceOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;

  // Balance-related props
  btcBalances?: WalletBalanceData;
  bbnBalances?: WalletBalanceData;
  ethBalances?: WalletBalanceData;
  btcCoinSymbol?: string;
  bbnCoinSymbol?: string;
  ethCoinSymbol?: string;
  balancesLoading?: boolean;
  hasUnconfirmedTransactions?: boolean;
  formatBalance?: (amount: number, coinSymbol: string) => string;

  // Optional settings section (for presets to customize)
  settingsSection?: React.ReactNode;

  // Optional overrides and configuration
  className?: string;
  mobileMode?: "drawer" | "dialog";
  copy?: {
    isCopied?: (key: "btc" | "bbn" | "eth" | "publicKey") => boolean;
    copyToClipboard?: (key: "btc" | "bbn" | "eth" | "publicKey", value: string) => void;
    timeout?: number;
  };
}

export const WalletMenu: React.FC<WalletMenuProps> = ({
  trigger,
  btcAddress,
  bbnAddress,
  ethAddress,
  selectedWallets,
  onDisconnect,
  forceOpen = false,
  onOpenChange,
  btcBalances,
  bbnBalances,
  ethBalances,
  btcCoinSymbol,
  bbnCoinSymbol,
  ethCoinSymbol,
  balancesLoading = false,
  hasUnconfirmedTransactions = false,
  formatBalance,
  settingsSection,
  className,
  mobileMode = "dialog",
  copy,
}) => {
  const { copyToClipboard: internalCopy, isCopied: internalIsCopied } = useCopy({ timeout: copy?.timeout });
  const isCopied = copy?.isCopied ?? internalIsCopied;
  const copyToClipboard = copy?.copyToClipboard ?? internalCopy;
  const [isOpen, setIsOpen] = useState(forceOpen);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  }, [onOpenChange]);

  const handleDisconnect = useCallback(() => {
    setIsOpen(false);
    onDisconnect();
  }, [onDisconnect]);

  const createFormatBalance = (coinSymbol?: string) => {
    if (!formatBalance || !coinSymbol) return undefined;
    return (amount: number) => formatBalance(amount, coinSymbol);
  };

  const btcSymbol = btcCoinSymbol || "BTC";
  const bbnSymbol = bbnCoinSymbol || "BABY";
  const ethSymbol = ethCoinSymbol || "ETH";

  return (
    <Menu
      trigger={trigger}
      open={isOpen}
      onOpenChange={handleOpenChange}
      mobileMode={mobileMode}
      className={twJoin(
        "shadow-lg border border-[#38708533] bg-surface dark:border-[#404040] rounded-lg",
        className,
      )}
    >
      <div className="p-4 space-y-6 w-full text-primary-main">
        <div className="flex flex-row gap-2 w-full md:flex-col">
          {btcAddress && (
            <WalletMenuCard
              walletType="Bitcoin"
              walletName={selectedWallets["BTC"]?.name}
              walletIcon={selectedWallets["BTC"]?.icon}
              address={btcAddress}
              isCopied={isCopied("btc")}
              onCopy={() => copyToClipboard("btc", btcAddress)}
              balances={btcBalances}
              coinSymbol={btcSymbol}
              isBalanceLoading={balancesLoading}
              hasUnconfirmedTransactions={hasUnconfirmedTransactions}
              formatBalance={createFormatBalance(btcSymbol)}
            />
          )}

          {bbnAddress && (
            <WalletMenuCard
              walletType="Babylon"
              walletName={selectedWallets["BBN"]?.name}
              walletIcon={selectedWallets["BBN"]?.icon}
              address={bbnAddress}
              isCopied={isCopied("bbn")}
              onCopy={() => copyToClipboard("bbn", bbnAddress)}
              balances={bbnBalances}
              coinSymbol={bbnSymbol}
              isBalanceLoading={balancesLoading}
              formatBalance={createFormatBalance(bbnSymbol)}
            />
          )}

          {ethAddress && (
            <WalletMenuCard
              walletType="Ethereum"
              walletName={selectedWallets["ETH"]?.name}
              walletIcon={selectedWallets["ETH"]?.icon}
              address={ethAddress}
              isCopied={isCopied("eth")}
              onCopy={() => copyToClipboard("eth", ethAddress)}
              balances={ethBalances}
              coinSymbol={ethSymbol}
              isBalanceLoading={balancesLoading}
              formatBalance={createFormatBalance(ethSymbol)}
            />
          )}
        </div>

        {/* Optional settings section (provided by presets) */}
        {settingsSection}

        {/* Disconnect Button */}
        <div className="pt-2">
          <WalletDisconnectButton
            onClick={handleDisconnect}
            fluid
          >
            Disconnect Wallets
          </WalletDisconnectButton>
        </div>
      </div>
    </Menu>
  );
};