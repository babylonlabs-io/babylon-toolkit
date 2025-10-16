import {
  Button,
  Card,
  Tabs,
  useIsMobile,
  AmountSliderWidget,
  AvatarGroup,
  Avatar,
  AttributeList,
  ChevronLeftIcon,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";

// Hardcoded market data
const MARKET_DATA = {
  pair: "BTC / USDC",
  totalMarketSize: "$498.98M",
  totalMarketSizeSubtext: "499.11M USDC",
  totalLiquidity: "$70.84M",
  totalLiquiditySubtext: "70.85M USDC",
  borrowRate: "6.11%",
  collateral: "BTC",
  loan: "USDC",
  liquidationLTV: "70%",
  oraclePrice: "BTC / USDC = 123,934.07",
  createdOn: "2024-09-04",
  utilization: "90.58%",
};

interface VaultMarketProps {
  marketId?: string;
  onBack: () => void;
}

export function VaultMarket({ onBack }: VaultMarketProps) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("borrow");
  
  // Form state
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [borrowAmount, setBorrowAmount] = useState(0);

  const maxCollateral = 10.0;
  const maxBorrow = 100000;

  const marketAttributes = [
    { label: "Collateral", value: MARKET_DATA.collateral },
    { label: "Loan", value: MARKET_DATA.loan },
    { label: "Liquidation LTV", value: MARKET_DATA.liquidationLTV },
    { label: "Oracle price", value: MARKET_DATA.oraclePrice },
    { label: "Created on", value: MARKET_DATA.createdOn },
    { label: "Utilization", value: MARKET_DATA.utilization },
  ];

  const borrowForm = (
    <div className="space-y-6">
      <div>
        <h3 className="text-accent-primary mb-4 text-base font-medium">Collateral</h3>
        <AmountSliderWidget
          amount={collateralAmount}
          currencyIcon="/btc.png"
          currencyName="Bitcoin"
          onAmountChange={(e) => setCollateralAmount(parseFloat(e.target.value) || 0)}
          balanceDetails={{
            balance: maxCollateral.toFixed(4),
            symbol: "BTC",
            price: 0,
            displayUSD: true,
          }}
          sliderValue={collateralAmount}
          sliderMin={0}
          sliderMax={maxCollateral}
          sliderStep={0.0001}
          onSliderChange={setCollateralAmount}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: `${maxCollateral.toFixed(4)} BTC`,
          }}
          rightField={{
            value: "$0.00 USD",
          }}
        />
      </div>

      <div>
        <h3 className="text-accent-primary mb-4 text-base font-medium">Borrow</h3>
        <AmountSliderWidget
          amount={borrowAmount}
          currencyIcon="/usdc.png"
          currencyName="USDC"
          onAmountChange={(e) => setBorrowAmount(parseFloat(e.target.value) || 0)}
          balanceDetails={{
            balance: maxBorrow.toFixed(0),
            symbol: "USDC",
            price: 1,
            displayUSD: true,
          }}
          sliderValue={borrowAmount}
          sliderMin={0}
          sliderMax={maxBorrow}
          sliderStep={100}
          onSliderChange={setBorrowAmount}
          sliderVariant="rainbow"
          leftField={{
            label: "LTV",
            value: "Safe",
          }}
          rightField={{
            value: "$0.00 USD",
          }}
        />
      </div>

      <div className="bg-surface-tertiary space-y-3 rounded-lg p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-accent-secondary">Collateral (BTC)</span>
          <span className="text-accent-primary font-medium">
            {collateralAmount}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-accent-secondary">Loan (USDC)</span>
          <span className="text-accent-primary font-medium">
            {borrowAmount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-accent-secondary">LTV</span>
          <span className="text-accent-primary font-medium">0</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-accent-secondary">Liquidation LTV</span>
          <span className="text-accent-primary font-medium">70%</span>
        </div>
      </div>

      <Button
        variant="contained"
        color="primary"
        size="large"
        fluid
        disabled={collateralAmount === 0 || borrowAmount === 0}
      >
        {collateralAmount === 0 || borrowAmount === 0
          ? "Enter an amount"
          : "Borrow"}
      </Button>
    </div>
  );

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        {/* Back button header */}
        <div className="mb-4">
          <button
            onClick={onBack}
            className="text-accent-secondary hover:text-accent-primary flex items-center gap-2 text-base transition-colors"
          >
            <ChevronLeftIcon size={16} variant="accent-secondary" />
            Dashboard
          </button>
        </div>

        {/* Tabs with Borrow/Repay */}
        <Tabs
          items={[
            { id: "borrow", label: "Borrow", content: borrowForm },
            {
              id: "repay",
              label: "Repay",
              content: (
                <div className="text-accent-secondary py-8 text-center">
                  Repay
                </div>
              ),
            },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    );
  }

  // Desktop layout - two column grid
  return (
    <div className="grid h-full grid-cols-[2fr_1px_1fr] gap-0">
      {/* Left side - Market info (scrollable) */}
      <div className="overflow-y-auto pr-8">
        {/* Back to Dashboard Button */}
        <button
          onClick={onBack}
          className="text-accent-secondary hover:text-accent-primary mb-6 flex items-center gap-2 text-base transition-colors"
        >
          <ChevronLeftIcon size={16} variant="accent-secondary" />
          Dashboard
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-3">
            <AvatarGroup size="large">
              <Avatar url="/btc.png" alt="BTC" size="large" variant="circular" />
              <Avatar url="/usdc.png" alt="USDC" size="large" variant="circular" />
            </AvatarGroup>
            <h1 className="text-accent-primary text-5xl font-normal">
              {MARKET_DATA.pair}
            </h1>
          </div>

          {/* Market Stats */}
          <div className="flex gap-8">
            <div>
              <p className="text-sm" style={{ color: "#999999" }}>
                Total Market Size
              </p>
              <p className="text-accent-primary text-2xl font-semibold">
                {MARKET_DATA.totalMarketSize}
              </p>
              <p className="text-accent-primary text-sm">
                {MARKET_DATA.totalMarketSizeSubtext}
              </p>
            </div>
            <div>
              <p className="text-sm" style={{ color: "#999999" }}>
                Total Liquidity
              </p>
              <p className="text-accent-primary text-2xl font-semibold">
                {MARKET_DATA.totalLiquidity}
              </p>
              <p className="text-accent-primary text-sm">
                {MARKET_DATA.totalLiquiditySubtext}
              </p>
            </div>
            <div>
              <p className="text-sm" style={{ color: "#999999" }}>
                Borrow Rate
              </p>
              <p className="text-accent-primary text-2xl font-semibold">
                {MARKET_DATA.borrowRate}
              </p>
            </div>
          </div>
        </div>

        {/* Market Attributes Card */}
        <Card>
          <h2 className="text-accent-primary mb-4 text-xl font-semibold">
            Market Attributes
          </h2>
          <AttributeList attributes={marketAttributes} />
        </Card>
      </div>

      {/* Vertical Divider */}
      <div className="bg-surface-secondary" />

      {/* Right side - Borrow form (sticky) */}
      <div className="sticky top-0 h-screen overflow-y-auto pl-6">
        <Card>
          <Tabs
            items={[
              { id: "borrow", label: "Borrow", content: borrowForm },
              {
                id: "repay",
                label: "Repay",
                content: (
                  <div className="text-accent-secondary py-8 text-center">
                    Repay
                  </div>
                ),
              },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </Card>
      </div>
    </div>
  );
}

