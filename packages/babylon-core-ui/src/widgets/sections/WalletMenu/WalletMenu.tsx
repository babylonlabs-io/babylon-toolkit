import React, { useState, useCallback } from "react";
import { Menu } from "../../../components/Menu";
import { WalletDisconnectButton } from "../../../components/Button";
import { WalletInfoCard } from "./components/WalletInfoCard";
import { WalletSettingItem } from "./components/WalletSettingItem";
import { WalletInfoSection } from "./components/WalletInfoSection";
import { UsingInscriptionIcon, LinkWalletIcon, BitcoinPublicKeyIcon } from "../../../components/Icons";
import { useCopy } from "../../../hooks/useCopy";
import { twJoin } from "tailwind-merge";

export interface WalletMenuProps {
  trigger: React.ReactNode;
  btcAddress: string;
  bbnAddress: string;
  selectedWallets: Record<string, { name: string; icon: string }>;
  ordinalsExcluded: boolean;
  linkedDelegationsVisibility: boolean;
  onIncludeOrdinals: () => void;
  onExcludeOrdinals: () => void;
  onDisplayLinkedDelegations: (value: boolean) => void;
  publicKeyNoCoord: string;
  onDisconnect: () => void;
  forceOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;

  // Optional overrides and configuration
  className?: string;
  mobileMode?: "drawer" | "dialog";
  copy?: {
    isCopied?: (key: "btc" | "bbn" | "publicKey") => boolean;
    copyToClipboard?: (key: "btc" | "bbn" | "publicKey", value: string) => void;
    timeout?: number;
  };
}

export const WalletMenu: React.FC<WalletMenuProps> = ({
  trigger,
  btcAddress,
  bbnAddress,
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

  return (
    <Menu
      trigger={trigger}
      open={isOpen}
      onOpenChange={handleOpenChange}
      mobileMode={mobileMode}
      className={twJoin(
        "shadow-lg border border-[#38708533] bg-[#FFFFFF] dark:bg-[#252525] dark:border-[#404040] rounded-lg",
        className,
      )}
    >
      <div className="p-4 space-y-6 w-full text-primary-main">
        <div className="flex flex-row gap-2 w-full md:flex-col overflow-x-auto">
          <WalletInfoCard
            walletType="Bitcoin"
            walletName={selectedWallets["BTC"]?.name}
            walletIcon={selectedWallets["BTC"]?.icon}
            address={btcAddress}
            isCopied={isCopied("btc")}
            onCopy={() => copyToClipboard("btc", btcAddress)}
          />

          <WalletInfoCard
            walletType="Babylon"
            walletName={selectedWallets["BBN"]?.name}
            walletIcon={selectedWallets["BBN"]?.icon}
            address={bbnAddress}
            isCopied={isCopied("bbn")}
            onCopy={() => copyToClipboard("bbn", bbnAddress)}
          />
        </div>

        <div className="flex flex-col w-full bg-[#F9F9F9] dark:bg-[#2F2F2F] rounded-lg md:bg-transparent md:dark:bg-transparent md:border-none md:gap-8">
          <WalletSettingItem
            icon={<UsingInscriptionIcon />}
            title="Using Inscriptions"
            status={ordinalsExcluded ? "Off" : "On"}
            value={!ordinalsExcluded}
            onChange={(value) =>
              value ? onIncludeOrdinals() : onExcludeOrdinals()
            }
          />

          <WalletSettingItem
            icon={<LinkWalletIcon />}
            title="Linked Wallet Stakes"
            status={linkedDelegationsVisibility ? "On" : "Off"}
            value={linkedDelegationsVisibility}
            onChange={onDisplayLinkedDelegations}
          />

          <WalletInfoSection
            title="Bitcoin Public Key"
            value={publicKeyNoCoord}
            isCopied={isCopied("publicKey")}
            onCopy={() => copyToClipboard("publicKey", publicKeyNoCoord)}
            icon={<BitcoinPublicKeyIcon />}
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
