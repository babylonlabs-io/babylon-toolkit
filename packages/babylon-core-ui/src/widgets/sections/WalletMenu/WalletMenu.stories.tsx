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
};

export const Default: Story = {
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

    return (
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
      />
    );
  },
};
