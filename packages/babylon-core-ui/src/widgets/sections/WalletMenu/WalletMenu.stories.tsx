import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { BtcEthWalletMenu } from "./presets/BtcEthWalletMenu";
import { BtcBabyWalletMenu } from "./presets/BtcBabyWalletMenu";
import { BabyWalletMenu } from "./presets/BabyWalletMenu";
import { AvatarGroup, Avatar } from "../../../components/Avatar";

const meta: Meta = {
  title: "Widgets/Menus/WalletMenu",
  tags: ["autodocs"],
};

export default meta;

// Example wallet data
const mockWalletData = {
  btcAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  bbnAddress: "bbn1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  ethAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  selectedWallets: {
    BTC: {
      name: "Binance Wallet",
      icon: "/images/wallets/binance.webp",
    },
    BBN: {
      name: "Binance Wallet",
      icon: "/images/wallets/binance.webp",
    },
    ETH: {
      name: "MetaMask",
      icon: "/images/wallets/metamask.webp",
    },
  },
  publicKeyNoCoord: "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  btcBalances: {
    staked: 0.15,
    stakable: 0.85,
    available: 1.0,
    total: 1.05,
    inscriptions: 0.05,
  },
  bbnBalances: {
    available: 250.5,
  },
  ethBalances: {
    available: 1.5,
  },
};

export const BtcEth: StoryObj = {
  name: "BtcEthWalletMenu (Vault)",
  render: () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const trigger = (
      <div className="cursor-pointer">
        <AvatarGroup max={2} variant="circular">
          <Avatar
            alt={mockWalletData.selectedWallets.BTC.name}
            url={mockWalletData.selectedWallets.BTC.icon}
            size="large"
            className={`object-contain bg-accent-contrast box-content ${isMenuOpen ? "outline outline-[2px] outline-accent-primary" : ""}`}
          />
          <Avatar
            alt={mockWalletData.selectedWallets.ETH.name}
            url={mockWalletData.selectedWallets.ETH.icon}
            size="large"
            className={`object-contain bg-accent-contrast box-content ${isMenuOpen ? "outline outline-[2px] outline-accent-primary" : ""}`}
          />
        </AvatarGroup>
      </div>
    );

    const customFormatBalance = (amount: number, coinSymbol: string) => {
      return `${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      })} ${coinSymbol}`;
    };

    return (
      <div className="space-y-4 p-4">
        <h3 className="text-lg font-semibold">BtcEthWalletMenu - For Vault (BTC + ETH)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Includes: BTC card, ETH card, Bitcoin Public Key. No BTC staking settings.
        </p>
        <BtcEthWalletMenu
          trigger={trigger}
          btcAddress={mockWalletData.btcAddress}
          ethAddress={mockWalletData.ethAddress}
          selectedWallets={mockWalletData.selectedWallets}
          publicKeyNoCoord={mockWalletData.publicKeyNoCoord}
          onDisconnect={() => console.log("Disconnect wallets")}
          onOpenChange={setIsMenuOpen}
          btcBalances={mockWalletData.btcBalances}
          ethBalances={mockWalletData.ethBalances}
          btcCoinSymbol="BTC"
          ethCoinSymbol="ETH"
          formatBalance={customFormatBalance}
        />
      </div>
    );
  },
};

export const BtcBaby: StoryObj = {
  name: "BtcBabyWalletMenu (Simple-staking)",
  render: () => {
    const [ordinalsExcluded, setOrdinalsExcluded] = useState(false);
    const [linkedDelegationsVisibility, setLinkedDelegationsVisibility] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const trigger = (
      <div className="cursor-pointer">
        <AvatarGroup max={2} variant="circular">
          <Avatar
            alt={mockWalletData.selectedWallets.BTC.name}
            url={mockWalletData.selectedWallets.BTC.icon}
            size="large"
            className={`object-contain bg-accent-contrast box-content ${isMenuOpen ? "outline outline-[2px] outline-accent-primary" : ""}`}
          />
          <Avatar
            alt={mockWalletData.selectedWallets.BBN.name}
            url={mockWalletData.selectedWallets.BBN.icon}
            size="large"
            className={`object-contain bg-accent-contrast box-content ${isMenuOpen ? "outline outline-[2px] outline-accent-primary" : ""}`}
          />
        </AvatarGroup>
      </div>
    );

    const customFormatBalance = (amount: number, coinSymbol: string) => {
      return `${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      })} ${coinSymbol}`;
    };

    return (
      <div className="space-y-4 p-4">
        <h3 className="text-lg font-semibold">BtcBabyWalletMenu - For simple-staking (BTC + BABY)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Includes: BTC card, BABY card, Using Inscriptions toggle, Linked Wallet Stakes toggle, Bitcoin Public Key.
        </p>
        <BtcBabyWalletMenu
          trigger={trigger}
          btcAddress={mockWalletData.btcAddress}
          bbnAddress={mockWalletData.bbnAddress}
          selectedWallets={mockWalletData.selectedWallets}
          ordinalsExcluded={ordinalsExcluded}
          linkedDelegationsVisibility={linkedDelegationsVisibility}
          onIncludeOrdinals={() => setOrdinalsExcluded(false)}
          onExcludeOrdinals={() => setOrdinalsExcluded(true)}
          onDisplayLinkedDelegations={setLinkedDelegationsVisibility}
          publicKeyNoCoord={mockWalletData.publicKeyNoCoord}
          onDisconnect={() => console.log("Disconnect wallets")}
          onOpenChange={setIsMenuOpen}
          btcBalances={mockWalletData.btcBalances}
          bbnBalances={mockWalletData.bbnBalances}
          btcCoinSymbol="BTC"
          bbnCoinSymbol="BABY"
          formatBalance={customFormatBalance}
        />
      </div>
    );
  },
};

export const Baby: StoryObj = {
  name: "BabyWalletMenu (BABY-only)",
  render: () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const trigger = (
      <div className="cursor-pointer">
        <AvatarGroup max={1} variant="circular">
          <Avatar
            alt={mockWalletData.selectedWallets.BBN.name}
            url={mockWalletData.selectedWallets.BBN.icon}
            size="large"
            className={`object-contain bg-accent-contrast box-content ${isMenuOpen ? "outline outline-[2px] outline-accent-primary" : ""}`}
          />
        </AvatarGroup>
      </div>
    );

    const customFormatBalance = (amount: number, coinSymbol: string) => {
      return `${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      })} ${coinSymbol}`;
    };

    return (
      <div className="space-y-4 p-4">
        <h3 className="text-lg font-semibold">BabyWalletMenu - For BABY-only apps</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Includes: BABY card only. No BTC-specific settings.
        </p>
        <BabyWalletMenu
          trigger={trigger}
          bbnAddress={mockWalletData.bbnAddress}
          selectedWallets={mockWalletData.selectedWallets}
          onDisconnect={() => console.log("Disconnect wallet")}
          onOpenChange={setIsMenuOpen}
          bbnBalances={mockWalletData.bbnBalances}
          bbnCoinSymbol="BABY"
          formatBalance={customFormatBalance}
        />
      </div>
    );
  },
};
