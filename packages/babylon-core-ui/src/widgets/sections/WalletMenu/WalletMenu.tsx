import React, { useState, useCallback } from "react";
import { Menu } from "../../../components/Menu";
import { WalletDisconnectButton } from "../../../components/Button";
import { WalletMenuCard, WalletBalanceData } from "./components/WalletMenuCard";
import { useCopy } from "../../../hooks/useCopy";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { twJoin } from "tailwind-merge";

export type WalletChain = "BTC" | "BBN" | "ETH";

export interface WalletMenuProps {
  trigger: React.ReactNode;
  btcAddress?: string;
  bbnAddress?: string;
  ethAddress?: string;
  selectedWallets: Partial<Record<WalletChain, { name: string; icon: string; iconBackground?: string }>>;
  /**
   * Called with no chain by the disconnect-everything button, and with a
   * single chain by each wallet card's own control. Handlers must honour the
   * argument, or a per-wallet disconnect will drop the whole session.
   */
  onDisconnect: (chain?: WalletChain) => void;
  /**
   * Renders per-wallet disconnect controls. Off by default so a host that has
   * not adopted the per-chain handler keeps the all-or-nothing behaviour.
   */
  perChainDisconnect?: boolean;
  /**
   * Row offering a chain the user has not connected — the Bitcoin capability
   * in an Ethereum-first session. The label is the app's, since only it knows
   * what the chain is for.
   */
  connectAction?: {
    label: string;
    onClick: () => void;
    "data-testid"?: string;
  };
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
  /** Phone presentation; `popover` shows the phone dropdown card instead of a sheet */
  mobileMode?: "drawer" | "dialog" | "popover";
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
  perChainDisconnect = false,
  connectAction,
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
  const isMobile = useIsMobile();
  const isPhonePopover = isMobile && mobileMode === "popover";
  const cardLayout = isPhonePopover ? "row" : "card";
  const connectedWalletCount = [btcAddress, bbnAddress, ethAddress].filter(Boolean).length;
  const disconnectLabel = connectedWalletCount === 1 ? "Disconnect Wallet" : "Disconnect Wallets";

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  }, [onOpenChange]);

  const handleDisconnect = useCallback(() => {
    setIsOpen(false);
    onDisconnect();
  }, [onDisconnect]);

  const handleDisconnectChain = useCallback(
    (chain: WalletChain) => () => {
      setIsOpen(false);
      onDisconnect(chain);
    },
    [onDisconnect],
  );

  const handleConnectAction = useCallback(() => {
    setIsOpen(false);
    connectAction?.onClick();
  }, [connectAction]);

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
        isPhonePopover
          ? "w-[253px]"
          : "shadow-lg border border-[#38708533] bg-surface dark:border-[#404040] rounded-lg",
        className,
      )}
    >
      <div className={twJoin("w-full text-primary-main", isPhonePopover ? "flex flex-col gap-4" : "p-4 space-y-6")}>
        <div className={twJoin("flex w-full", isPhonePopover ? "flex-col gap-4" : "flex-row gap-2 md:flex-col")}>
          {btcAddress && (
            <WalletMenuCard
              layout={cardLayout}
              walletType="Bitcoin"
              walletName={selectedWallets["BTC"]?.name}
              walletIcon={selectedWallets["BTC"]?.icon}
              walletIconBackground={selectedWallets["BTC"]?.iconBackground}
              address={btcAddress}
              isCopied={isCopied("btc")}
              onCopy={() => copyToClipboard("btc", btcAddress)}
              balances={btcBalances}
              coinSymbol={btcSymbol}
              isBalanceLoading={balancesLoading}
              hasUnconfirmedTransactions={hasUnconfirmedTransactions}
              formatBalance={createFormatBalance(btcSymbol)}
              onDisconnect={perChainDisconnect ? handleDisconnectChain("BTC") : undefined}
            />
          )}

          {bbnAddress && (
            <WalletMenuCard
              layout={cardLayout}
              walletType="Babylon"
              walletName={selectedWallets["BBN"]?.name}
              walletIcon={selectedWallets["BBN"]?.icon}
              walletIconBackground={selectedWallets["BBN"]?.iconBackground}
              address={bbnAddress}
              isCopied={isCopied("bbn")}
              onCopy={() => copyToClipboard("bbn", bbnAddress)}
              balances={bbnBalances}
              coinSymbol={bbnSymbol}
              isBalanceLoading={balancesLoading}
              formatBalance={createFormatBalance(bbnSymbol)}
              onDisconnect={perChainDisconnect ? handleDisconnectChain("BBN") : undefined}
            />
          )}

          {ethAddress && (
            <WalletMenuCard
              layout={cardLayout}
              walletType="Ethereum"
              walletName={selectedWallets["ETH"]?.name}
              walletIcon={selectedWallets["ETH"]?.icon}
              walletIconBackground={selectedWallets["ETH"]?.iconBackground}
              address={ethAddress}
              isCopied={isCopied("eth")}
              onCopy={() => copyToClipboard("eth", ethAddress)}
              balances={ethBalances}
              coinSymbol={ethSymbol}
              isBalanceLoading={balancesLoading}
              formatBalance={createFormatBalance(ethSymbol)}
              onDisconnect={perChainDisconnect ? handleDisconnectChain("ETH") : undefined}
            />
          )}
        </div>

        {connectAction && (
          <button
            type="button"
            onClick={handleConnectAction}
            data-testid={connectAction["data-testid"]}
            className="flex w-full items-center justify-center rounded-[4px] bg-[#F9F9F9] p-3 text-sm font-medium text-accent-primary transition-opacity hover:opacity-80 dark:bg-[#2F2F2F] md:p-4"
          >
            {connectAction.label}
          </button>
        )}

        {/* Optional settings section (provided by presets) */}
        {settingsSection}

        {/* Disconnect Button */}
        <div className={isPhonePopover ? undefined : "pt-2"}>
          <WalletDisconnectButton
            onClick={handleDisconnect}
            fluid
            className={isPhonePopover ? "rounded-lg !bg-error-dark hover:!bg-error-dark/90 font-normal tracking-[0.17px]" : undefined}
          >
            {disconnectLabel}
          </WalletDisconnectButton>
        </div>
      </div>
    </Menu>
  );
};