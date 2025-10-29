import React from "react";
import { WalletMenu, WalletMenuProps } from "../WalletMenu";

export type BabyWalletMenuProps = Omit<WalletMenuProps, "settingsSection">;

/**
 * BabyWalletMenu - Wallet menu preset for BABY-only applications
 * 
 * Features:
 * - BABY wallet card only
 * - No BTC-specific settings
 * 
 * Use this for BABY-only applications that don't involve BTC staking.
 */
export const BabyWalletMenu: React.FC<BabyWalletMenuProps> = (props) => {
  // No settings section - just the wallet card
  return <WalletMenu {...props} settingsSection={null} />;
};

