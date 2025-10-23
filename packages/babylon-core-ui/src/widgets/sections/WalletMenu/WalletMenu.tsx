import React, { useState, useCallback } from "react";
import { Menu } from "../../../components/Menu";
import { WalletDisconnectButton } from "../../../components/Button";
import { WalletMenuCard, WalletBalanceData } from "./components/WalletMenuCard";
import { WalletMenuSettingItem } from "./components/WalletMenuSettingItem";
import { WalletMenuInfoItem } from "./components/WalletMenuInfoItem";
import { UsingInscriptionIcon, LinkWalletIcon, BitcoinPublicKeyIcon, InfoIcon } from "../../../components/Icons";
import { ThemedIcon } from "../../../components/Icons/ThemedIcon";
import { useCopy } from "../../../hooks/useCopy";
import { twJoin } from "tailwind-merge";

export type WalletChain = "BTC" | "BBN" | "ETH";

export interface WalletMenuProps {
  trigger: React.ReactNode;
  btcAddress: string;
  bbnAddress: string;
  ethAddress?: string;
  selectedWallets: Partial<Record<WalletChain, { name: string; icon: string }>>;
  ordinalsExcluded: boolean;
  linkedDelegationsVisibility: boolean;
  onIncludeOrdinals: () => void;
  onExcludeOrdinals: () => void;
  onDisplayLinkedDelegations: (value: boolean) => void;
  publicKeyNoCoord: string;
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
  ordinalsExcluded,
  linkedDelegationsVisibility,
  onIncludeOrdinals,
  onExcludeOrdinals,
  onDisplayLinkedDelegations,
  publicKeyNoCoord,
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

        <div className="flex flex-col w-full bg-[#F9F9F9] dark:bg-[#2F2F2F] rounded-lg md:bg-transparent md:dark:bg-transparent md:border-none md:gap-8">
          <WalletMenuSettingItem
            icon={<ThemedIcon variant="primary" background rounded><UsingInscriptionIcon /></ThemedIcon>}
            title="Using Inscriptions"
            status={ordinalsExcluded ? "Off" : "On"}
            value={!ordinalsExcluded}
            onChange={(value) =>
              value ? onIncludeOrdinals() : onExcludeOrdinals()
            }
          />

          <WalletMenuSettingItem
            icon={<ThemedIcon variant="primary" background rounded><LinkWalletIcon /></ThemedIcon>}
            title={<>
              Linked Wallet
              <br className="hidden md:block" />
              <span className="md:hidden"> </span>Stakes
            </>}
            status={linkedDelegationsVisibility ? "On" : "Off"}
            value={linkedDelegationsVisibility}
            onChange={onDisplayLinkedDelegations}
            tooltip="Linked Wallet Stakes show all stakes created with the same Bitcoin wallet, even if different BABY wallets were used. It helps you track and manage them in one place."
            infoIcon={<InfoIcon size={14} variant="secondary" />}
          />

          <WalletMenuInfoItem
            title="Bitcoin Public Key"
            value={publicKeyNoCoord}
            isCopied={isCopied("publicKey")}
            onCopy={() => copyToClipboard("publicKey", publicKeyNoCoord)}
            icon={<ThemedIcon variant="primary" background rounded><BitcoinPublicKeyIcon /></ThemedIcon>}
            className="rounded-b-lg rounded-t-none md:rounded-none"
          />
        </div>

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