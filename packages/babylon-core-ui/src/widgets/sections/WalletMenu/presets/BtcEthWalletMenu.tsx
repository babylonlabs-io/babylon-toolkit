import React from "react";
import { WalletMenu, WalletMenuProps } from "../WalletMenu";
import { WalletMenuInfoItem } from "../components/WalletMenuInfoItem";
import { BitcoinPublicKeyIcon } from "../../../../components/Icons";
import { ThemedIcon } from "../../../../components/Icons/ThemedIcon";
import { useCopy } from "../../../../hooks/useCopy";

export interface BtcEthWalletMenuProps extends Omit<WalletMenuProps, "settingsSection"> {
  /** Bitcoin public key (no coordinates) */
  publicKeyNoCoord: string;
}

/**
 * BtcEthWalletMenu - Wallet menu preset for Vault (BTC + ETH)
 * 
 * Features:
 * - BTC wallet card
 * - ETH wallet card
 * - Bitcoin Public Key display
 * 
 * Does NOT include:
 * - Using Inscriptions toggle
 * - Linked Wallet Stakes toggle
 */
export const BtcEthWalletMenu: React.FC<BtcEthWalletMenuProps> = ({
  publicKeyNoCoord,
  copy,
  ...walletMenuProps
}) => {
  const { copyToClipboard: internalCopy, isCopied: internalIsCopied } = useCopy({ timeout: copy?.timeout });
  const isCopied = copy?.isCopied ?? internalIsCopied;
  const copyToClipboard = copy?.copyToClipboard ?? internalCopy;

  const settingsSection = (
    <div className="flex flex-col w-full bg-[#F9F9F9] dark:bg-[#2F2F2F] rounded-lg md:bg-transparent md:dark:bg-transparent md:border-none md:gap-8">
      <WalletMenuInfoItem
        title="Bitcoin Public Key"
        value={publicKeyNoCoord}
        isCopied={isCopied("publicKey")}
        onCopy={() => copyToClipboard("publicKey", publicKeyNoCoord)}
        icon={<ThemedIcon variant="primary" background rounded><BitcoinPublicKeyIcon /></ThemedIcon>}
        className="rounded-lg md:rounded-none"
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

