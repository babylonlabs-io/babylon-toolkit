import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WalletMenu } from "./WalletMenu";
import { AvatarGroup, Avatar } from "../../../components/Avatar";

const meta: Meta<typeof WalletMenu> = {
  title: "Widgets/Menus/WalletMenu",
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

export const WithEthereum: Story = {
  render: () => {
    const [ordinalsExcluded, setOrdinalsExcluded] = useState(false);
    const [linkedDelegationsVisibility, setLinkedDelegationsVisibility] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [balancesLoading, setBalancesLoading] = useState(false);
    const [hasUnconfirmedTx, setHasUnconfirmedTx] = useState(false);

    const ethWalletData = {
      ethAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      selectedWallets: {
        BTC: {
          name: "OKX Wallet",
          icon: "data:image/svg+xml,%3c?xml%20version='1.0'%20encoding='UTF-8'?%3e%3csvg%20width='225px'%20height='224px'%20viewBox='0%200%20225%20224'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3e%3ctitle%3eokx%3c/title%3e%3cg%20id='Page-1'%20stroke='none'%20strokeWidth='1'%20fill='none'%20fill-rule='evenodd'%3e%3cg%20id='okx'%20transform='translate(0.401000,%200.006000)'%20fill='%23000000'%20fill-rule='nonzero'%3e%3cpath%20d='M144.382,74.667%20L79.673,74.667%20C76.924,74.667%2074.695,76.895%2074.695,79.644%20L74.695,144.354%20C74.695,147.103%2076.924,149.332%2079.673,149.332%20L144.382,149.332%20C147.131,149.332%20149.36,147.103%20149.36,144.354%20L149.36,79.644%20C149.36,76.895%20147.131,74.667%20144.382,74.667%20Z'%20id='Path'%3e%3c/path%3e%3cpath%20d='M69.687,0%20L4.978,0%20C2.229,0%200,2.228%200,4.978%20L0,69.687%20C0,72.436%202.229,74.665%204.978,74.665%20L69.687,74.665%20C72.437,74.665%2074.665,72.436%2074.665,69.687%20L74.665,4.978%20C74.665,2.228%2072.437,0%2069.687,0%20Z'%20id='Path'%3e%3c/path%3e%3cpath%20d='M219.017,0%20L154.307,0%20C151.558,0%20149.329,2.228%20149.329,4.978%20L149.329,69.687%20C149.329,72.436%20151.558,74.665%20154.307,74.665%20L219.017,74.665%20C221.766,74.665%20223.994,72.436%20223.994,69.687%20L223.994,4.978%20C223.994,2.228%20221.766,0%20219.017,0%20Z'%20id='Path'%3e%3c/path%3e%3cpath%20d='M69.687,149.328%20L4.978,149.328%20C2.229,149.328%200,151.556%200,154.305%20L0,219.015%20C0,221.764%202.229,223.993%204.978,223.993%20L69.687,223.993%20C72.437,223.993%2074.665,221.764%2074.665,219.015%20L74.665,154.305%20C74.665,151.556%2072.437,149.328%2069.687,149.328%20Z'%20id='Path'%3e%3c/path%3e%3cpath%20d='M219.017,149.328%20L154.307,149.328%20C151.558,149.328%20149.329,151.556%20149.329,154.305%20L149.329,219.015%20C149.329,221.764%20151.558,223.993%20154.307,223.993%20L219.017,223.993%20C221.766,223.993%20223.994,221.764%20223.994,219.015%20L223.994,154.305%20C223.994,151.556%20221.766,149.328%20219.017,149.328%20Z'%20id='Path'%3e%3c/path%3e%3c/g%3e%3c/g%3e%3c/svg%3e",
        },
        ETH: {
          name: "MetaMask",
          icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzYyN0VFQSIvPgogIDxwYXRoIGQ9Ik0xNiA0TDcuNSAxNi4yNUwxNiAyMkwyNC41IDE2LjI1TDE2IDR6IiBmaWxsPSJ3aGl0ZSIvPgogIDxwYXRoIGQ9Ik0xNiAyMi43NUw3LjUgMTdMMTYgMjhMMjQuNSAxN0wxNiAyMi43NXoiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNiIvPgo8L3N2Zz4=",
        },
      },
      ethBalances: {
        available: 2.456,
      },
    };

    const trigger = (
      <div className="cursor-pointer">
        <AvatarGroup max={2} variant="circular">
          <Avatar
            alt={ethWalletData.selectedWallets.BTC.name}
            url={ethWalletData.selectedWallets.BTC.icon}
            size="large"
            className={`object-contain bg-accent-contrast box-content ${isMenuOpen ? "outline outline-[2px] outline-accent-primary" : ""}`}
          />
          <Avatar
            alt={ethWalletData.selectedWallets.ETH.name}
            url={ethWalletData.selectedWallets.ETH.icon}
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
          bbnAddress=""
          ethAddress={ethWalletData.ethAddress}
          selectedWallets={ethWalletData.selectedWallets}
          ordinalsExcluded={ordinalsExcluded}
          linkedDelegationsVisibility={linkedDelegationsVisibility}
          onIncludeOrdinals={() => setOrdinalsExcluded(false)}
          onExcludeOrdinals={() => setOrdinalsExcluded(true)}
          onDisplayLinkedDelegations={setLinkedDelegationsVisibility}
          publicKeyNoCoord={mockWalletData.publicKeyNoCoord}
          onDisconnect={() => console.log("Disconnect wallets")}
          onOpenChange={setIsMenuOpen}
          btcBalances={mockWalletData.btcBalances}
          ethBalances={ethWalletData.ethBalances}
          btcCoinSymbol="BTC"
          ethCoinSymbol="ETH"
          balancesLoading={balancesLoading}
          hasUnconfirmedTransactions={hasUnconfirmedTx}
          formatBalance={customFormatBalance}
        />

        <div className="flex flex-col gap-4 p-4 border border-gray-300 rounded-lg max-w-md">
          <h4 className="font-semibold">State Controls</h4>
          <p className="text-sm text-gray-600">Vault route scenario: Bitcoin + Ethereum wallets</p>
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

export const WithoutBitcoin: Story = {
  render: () => {
    const [ordinalsExcluded, setOrdinalsExcluded] = useState(false);
    const [linkedDelegationsVisibility, setLinkedDelegationsVisibility] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [balancesLoading, setBalancesLoading] = useState(false);
    const [hasUnconfirmedTx, setHasUnconfirmedTx] = useState(false);

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
      <div className="space-y-4">
        <WalletMenu
          trigger={trigger}
          btcAddress=""
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
