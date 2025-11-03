import React from "react";
import { WalletMenu, WalletMenuProps } from "../WalletMenu";
import { WalletMenuSettingItem } from "../components/WalletMenuSettingItem";
import { WalletMenuInfoItem } from "../components/WalletMenuInfoItem";
import { UsingInscriptionIcon, LinkWalletIcon, BitcoinPublicKeyIcon, InfoIcon } from "../../../../components/Icons";
import { ThemedIcon } from "../../../../components/Icons/ThemedIcon";
import { useCopy } from "../../../../hooks/useCopy";

export interface BtcBabyWalletMenuProps extends Omit<WalletMenuProps, "settingsSection"> {
  /** Whether inscriptions/ordinals are excluded */
  ordinalsExcluded: boolean;
  /** Handler for including ordinals */
  onIncludeOrdinals: () => void;
  /** Handler for excluding ordinals */
  onExcludeOrdinals: () => void;
  /** Whether linked delegations are visible */
  linkedDelegationsVisibility: boolean;
  /** Handler for toggling linked delegations display */
  onDisplayLinkedDelegations: (value: boolean) => void;
  /** Bitcoin public key (no coordinates) */
  publicKeyNoCoord: string;
}

/**
 * BtcBabyWalletMenu - Wallet menu preset for simple-staking (BTC + BABY)
 * 
 * Features:
 * - BTC wallet card
 * - BABY wallet card
 * - Using Inscriptions toggle
 * - Linked Wallet Stakes toggle
 * - Bitcoin Public Key display
 * 
 * Use this for BTC staking applications that need inscription and linked wallet features.
 */
export const BtcBabyWalletMenu: React.FC<BtcBabyWalletMenuProps> = ({
  ordinalsExcluded,
  onIncludeOrdinals,
  onExcludeOrdinals,
  linkedDelegationsVisibility,
  onDisplayLinkedDelegations,
  publicKeyNoCoord,
  copy,
  ...walletMenuProps
}) => {
  const { copyToClipboard: internalCopy, isCopied: internalIsCopied } = useCopy({ timeout: copy?.timeout });
  const isCopied = copy?.isCopied ?? internalIsCopied;
  const copyToClipboard = copy?.copyToClipboard ?? internalCopy;

  const settingsSection = (
    <div className="flex flex-col w-full bg-neutral-100 rounded-lg md:bg-transparent md:border-none md:gap-8">
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
  );

  return (
    <WalletMenu
      {...walletMenuProps}
      copy={copy}
      settingsSection={settingsSection}
    />
  );
};

