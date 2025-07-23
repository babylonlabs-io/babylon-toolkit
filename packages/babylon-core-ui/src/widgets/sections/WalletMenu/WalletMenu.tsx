import React, { useState, useCallback } from "react";
import { Menu } from "../../../components/Menu";
import { WalletDisconnectButton } from "../../../components/Button";
import { WalletInfoCard } from "./components/WalletInfoCard";
import { WalletSettingItem } from "./components/WalletSettingItem";
import { WalletInfoSection } from "./components/WalletInfoSection";
import { UsingInscriptionIcon, LinkWalletIcon, BitcoinPublicKeyIcon } from "../../../components/Icons";
import { useCopy } from "../../../hooks/useCopy";

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
}) => {
  const { copyToClipboard, isCopied } = useCopy();
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
      mobileMode="dialog"
      className="shadow-lg border border-[#38708533] bg-[#FFFFFF] dark:bg-[#252525] dark:border-[#404040] rounded-lg"
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

        <div className="flex flex-col gap-8 w-full">
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
