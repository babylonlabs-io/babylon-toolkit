import React from "react";
import { WalletMenu, WalletMenuProps } from "../WalletMenu";
import { WalletMenuSettingItem } from "../components/WalletMenuSettingItem";
import { WalletMenuInfoItem } from "../components/WalletMenuInfoItem";
import { UsingInscriptionIcon, BitcoinPublicKeyIcon } from "../../../../components/Icons";
import { ThemedIcon } from "../../../../components/Icons/ThemedIcon";
import { useCopy } from "../../../../hooks/useCopy";

export interface BtcEthWalletMenuProps extends Omit<WalletMenuProps, "settingsSection"> {
  /** Whether inscriptions/ordinals are excluded */
  ordinalsExcluded: boolean;
  /** Handler for including ordinals */
  onIncludeOrdinals: () => void;
  /** Handler for excluding ordinals */
  onExcludeOrdinals: () => void;
  /** Bitcoin public key (no coordinates) */
  publicKeyNoCoord: string;
  /**
   * Show the "Spend inscribed BTC" toggle. Defaults to true. Pass false to hide
   * it when the connected wallet has no inscription UTXOs, so users without
   * Ordinals/Runes aren't shown a control that does nothing.
   */
  showInscriptionsToggle?: boolean;
}

/**
 * BtcEthWalletMenu - Wallet menu preset for Vault (BTC + ETH)
 *
 * Features:
 * - BTC wallet card
 * - ETH wallet card
 * - Spend inscribed BTC toggle
 * - Bitcoin public key display
 *
 * Does NOT include:
 * - Linked Wallet Stakes toggle
 */
export const BtcEthWalletMenu: React.FC<BtcEthWalletMenuProps> = ({
  ordinalsExcluded,
  onIncludeOrdinals,
  onExcludeOrdinals,
  publicKeyNoCoord,
  showInscriptionsToggle = true,
  copy,
  ...walletMenuProps
}) => {
  const { copyToClipboard: internalCopy, isCopied: internalIsCopied } = useCopy({ timeout: copy?.timeout });
  const isCopied = copy?.isCopied ?? internalIsCopied;
  const copyToClipboard = copy?.copyToClipboard ?? internalCopy;

  const settingsSection = (
    <div className="flex w-full flex-col rounded-lg bg-neutral-100 md:gap-8 md:border-none md:bg-transparent">
      {showInscriptionsToggle && (
        <WalletMenuSettingItem
          icon={
            <ThemedIcon variant="primary" background rounded>
              <UsingInscriptionIcon />
            </ThemedIcon>
          }
          title="Spend inscribed BTC"
          status={ordinalsExcluded ? "Off" : "On"}
          value={!ordinalsExcluded}
          onChange={(value) => (value ? onIncludeOrdinals() : onExcludeOrdinals())}
        />
      )}

      <WalletMenuInfoItem
        title="Bitcoin public key"
        value={publicKeyNoCoord}
        isCopied={isCopied("publicKey")}
        onCopy={() => copyToClipboard("publicKey", publicKeyNoCoord)}
        icon={
          <ThemedIcon variant="primary" background rounded>
            <BitcoinPublicKeyIcon />
          </ThemedIcon>
        }
        className={
          showInscriptionsToggle ? "rounded-b-lg rounded-t-none md:rounded-none" : "rounded-lg md:rounded-none"
        }
      />
    </div>
  );

  return <WalletMenu {...walletMenuProps} copy={copy} settingsSection={settingsSection} />;
};
