import {
  Button,
  Card,
  Tabs,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { IoClose } from "react-icons/io5";

// Local AttributeList component
interface AttributeListProps {
  attributes: Array<{
    label: string;
    value: string | React.ReactNode;
  }>;
  className?: string;
}

function AttributeList({ attributes, className }: AttributeListProps) {
  return (
    <div className={className}>
      {attributes.map((attr, index) => (
        <div
          key={index}
          className="flex items-center justify-between border-b border-surface-secondary py-4 first:pt-0 last:border-0"
        >
          <span className="text-sm text-accent-secondary">{attr.label}</span>
          <span className="text-sm text-accent-primary font-medium">
            {attr.value}
          </span>
        </div>
      ))}
    </div>
  );
}

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

interface CollateralSectionProps {
  amount: number;
  max: number;
  onChange: (value: number) => void;
  usdValue: string;
}

function CollateralSection({
  amount,
  max,
  onChange,
  usdValue,
}: CollateralSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium text-accent-primary">Collateral</h3>
      
      <div className="flex items-center justify-between rounded-lg bg-surface-tertiary p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">₿</span>
          <span className="text-base text-accent-primary">Bitcoin</span>
        </div>
        <span className="text-xl font-semibold text-accent-primary">
          {amount}
        </span>
      </div>

      <input
        type="range"
        min="0"
        max={max}
        step="0.0001"
        value={amount}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary-light"
      />

      <div className="flex items-center justify-between text-sm">
        <span className="text-accent-secondary">Max</span>
        <span className="text-accent-secondary">{max.toFixed(4)} BTC</span>
        <span className="text-accent-secondary">{usdValue}</span>
      </div>
    </div>
  );
}

interface BorrowSectionProps {
  amount: number;
  max: number;
  onChange: (value: number) => void;
  ltv: string;
  usdValue: string;
}

function BorrowSection({
  amount,
  max,
  onChange,
  ltv,
  usdValue,
}: BorrowSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium text-accent-primary">Borrow</h3>
      
      <div className="flex items-center justify-between rounded-lg bg-surface-tertiary p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💵</span>
          <span className="text-base text-accent-primary">USDC</span>
        </div>
        <span className="text-xl font-semibold text-accent-primary">
          {amount.toLocaleString()}
        </span>
      </div>

      <input
        type="range"
        min="0"
        max={max}
        step="100"
        value={amount}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-green-500"
      />

      <div className="flex items-center justify-between text-sm">
        <span className="text-accent-secondary">LTV: {ltv}</span>
        <span className="text-accent-secondary">{usdValue}</span>
      </div>
    </div>
  );
}

export function BorrowPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("borrow");
  
  // Form state
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [borrowAmount, setBorrowAmount] = useState(0);

  const maxCollateral = 10.0;
  const maxBorrow = 100000;

  const handleBack = () => {
    navigate("/vault");
  };

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
      <CollateralSection
        amount={collateralAmount}
        max={maxCollateral}
        onChange={setCollateralAmount}
        usdValue="$0.00 USD"
      />

      <BorrowSection
        amount={borrowAmount}
        max={maxBorrow}
        onChange={setBorrowAmount}
        ltv="Safe"
        usdValue="$0.00 USD"
      />

      <div className="space-y-3 rounded-lg bg-surface-tertiary p-4">
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
      <div className="fixed inset-0 z-50 flex flex-col bg-surface">
        <div className="flex items-center justify-between border-b border-surface-secondary p-4">
          <button
            onClick={handleBack}
            className="rounded p-2 hover:bg-surface-secondary"
            aria-label="Close"
          >
            <IoClose size={24} className="text-accent-primary" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <Tabs
            items={[
              { id: "borrow", label: "Borrow", content: borrowForm },
              {
                id: "repay",
                label: "Repay",
                content: (
                  <div className="text-center text-accent-secondary">
                    Repay functionality coming soon
                  </div>
                ),
              },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="container mx-auto flex max-w-[1200px] flex-1 flex-col gap-6 px-4 py-6">
      <Card>
        <div className="mb-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">₿</span>
              <span className="text-3xl">💵</span>
            </div>
            <h1 className="text-3xl font-semibold text-accent-primary">
              {MARKET_DATA.pair}
            </h1>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-accent-secondary">
                Total Market Size
              </p>
              <p className="text-2xl font-semibold text-accent-primary">
                {MARKET_DATA.totalMarketSize}
              </p>
              <p className="text-sm text-accent-secondary">
                {MARKET_DATA.totalMarketSizeSubtext}
              </p>
            </div>
            <div>
              <p className="text-sm text-accent-secondary">Total Liquidity</p>
              <p className="text-2xl font-semibold text-accent-primary">
                {MARKET_DATA.totalLiquidity}
              </p>
              <p className="text-sm text-accent-secondary">
                {MARKET_DATA.totalLiquiditySubtext}
              </p>
            </div>
            <div>
              <p className="text-sm text-accent-secondary">Borrow Rate</p>
              <p className="text-2xl font-semibold text-accent-primary">
                {MARKET_DATA.borrowRate}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[2fr_1fr] gap-8">
          {/* Left side - Market Attributes */}
          <div>
            <h2 className="mb-4 text-xl font-semibold text-accent-primary">
              Market Attributes
            </h2>
            <AttributeList attributes={marketAttributes} />

            {/* Chart placeholder */}
            <div className="mt-8 rounded-lg border border-surface-secondary bg-surface-tertiary p-8">
              <p className="text-center text-accent-secondary">
                Chart coming soon
              </p>
            </div>
          </div>

          {/* Right side - Borrow Form */}
          <div className="rounded-lg bg-surface-secondary p-6">
            <Tabs
              items={[
                { id: "borrow", label: "Borrow", content: borrowForm },
                {
                  id: "repay",
                  label: "Repay",
                  content: (
                    <div className="text-center text-accent-secondary">
                      Repay functionality coming soon
                    </div>
                  ),
                },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

