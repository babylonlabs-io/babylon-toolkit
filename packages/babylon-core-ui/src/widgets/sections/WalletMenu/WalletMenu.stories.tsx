import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WalletMenu } from "./WalletMenu";
import { AvatarGroup, Avatar } from "../../../components/Avatar";

const meta: Meta<typeof WalletMenu> = {
  title: "Widgets/sections/WalletMenu",
  component: WalletMenu,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Example wallet data
const mockWalletData = {
  btcAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  bbnAddress: "bbn1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  selectedWallets: {
    BTC: {
      name: "Binance Wallet",
      icon: "/images/wallets/binance.webp",
    },
    BBN: {
      name: "Binance Wallet", 
      icon: "/images/wallets/binance.webp",
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
};

export const Default: Story = {
  render: () => {
    const [ordinalsExcluded, setOrdinalsExcluded] = useState(false);
    const [linkedDelegationsVisibility, setLinkedDelegationsVisibility] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [balancesLoading, setBalancesLoading] = useState(false);
    const [hasUnconfirmedTx, setHasUnconfirmedTx] = useState(false);

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
      <div className="space-y-4">
        <WalletMenu
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
          balancesLoading={balancesLoading}
          hasUnconfirmedTransactions={hasUnconfirmedTx}
          formatBalance={customFormatBalance}
        />
        
        <div className="flex flex-col gap-4 p-4 border border-gray-300 rounded-lg max-w-md">
          <h4 className="font-semibold">State Controls</h4>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={balancesLoading}
              onChange={(e) => setBalancesLoading(e.target.checked)}
            />
            Loading State
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={hasUnconfirmedTx}
              onChange={(e) => setHasUnconfirmedTx(e.target.checked)}
            />
            Has Unconfirmed Transactions (BTC only)
          </label>
        </div>
      </div>
    );
  },
};
