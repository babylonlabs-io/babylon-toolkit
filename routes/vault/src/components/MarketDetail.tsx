import { Card, Avatar, AvatarGroup, Tabs, Button, MarketStatCard, AmountSliderWidget, formatAmount, parseAmount } from "@babylonlabs-io/core-ui";
import { KeyValueList } from "@babylonlabs-io/core-ui";
import { useNavigate, useParams } from "react-router";
import { useState, useMemo } from "react";
import { LoanSummaryCard } from "./LoanSummaryCard";
import { BorrowReviewModal } from "./BorrowReviewModal";

export function MarketDetail() {
  const navigate = useNavigate();
  const { marketId } = useParams<{ marketId: string }>();
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [borrowAmount, setBorrowAmount] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleBack = () => {
    navigate("/vault");
  };

  const handleBorrow = () => {
    // Open the review modal
    setShowReviewModal(true);
  };

  const handleConfirmBorrow = async () => {
    setProcessing(true);
    try {
      // TODO: Implement actual borrow transaction
      console.log("Confirming borrow:", { marketId, collateralAmount, borrowAmount });
      
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Close modal on success
      setShowReviewModal(false);
      
      // TODO: Show success message or navigate to position
    } catch (error) {
      console.error("Borrow failed:", error);
      // TODO: Show error message
    } finally {
      setProcessing(false);
    }
  };

  // Hardcoded data - TO BE REMOVED
  const maxCollateral = 10.0;
  const maxBorrow = 100000;
  const btcPrice = 112694.16;
  const liquidationLtv = 70;

  // Calculate LTV
  const ltv = useMemo(() => {
    if (collateralAmount === 0) return 0;
    const collateralValueUSD = collateralAmount * btcPrice;
    return (borrowAmount / collateralValueUSD) * 100;
  }, [collateralAmount, borrowAmount, btcPrice]);

  const marketAttributes = [
    { label: "Collateral", value: "BTC" },
    { label: "Loan", value: "USDC" },
    { label: "Liquidation LTV", value: "70%" },
    { label: "Oracle price", value: `BTC / USDC = ${btcPrice.toLocaleString()}` },
    { label: "Created on", value: "2025-10-14" },
    { label: "Utilization", value: "90.58%" },
  ];

  return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-6">
        <div className="grid grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
        <Button 
          variant="ghost" 
          color="primary" 
          size="medium" 
          className="flex items-center gap-2 !px-2"
          onClick={handleBack}
          aria-label="Back to dashboard"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm">Dashboard</span>
        </Button>

        <div className="flex items-center gap-3">
          <AvatarGroup size="large">
            <Avatar url="/btc.png" alt="BTC" size="large" variant="circular" />
            <Avatar url="/usdc.png" alt="USDC" size="large" variant="circular" />
          </AvatarGroup>
          <span className="text-[48px] font-normal text-accent-primary">BTC / USDC</span>
        </div>

        <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1">
          <MarketStatCard
            title="Total Market Size"
            amount="$525.40M"
            subtitle="525.40M USDC"
          />
          <MarketStatCard
            title="Total Liquidity"
            amount="$182.60M"
            subtitle="182.6M USDC"
          />
          <MarketStatCard
            title="Borrow Rate"
            amount="6.25%"
          />
        </div>

          <KeyValueList items={marketAttributes} title="Market Attributes" />
        </div>

        <div className="top-24">
          <Card>
          <Tabs
              items={[
                {
                  id: "borrow",
                  label: "Borrow",
                  content: (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h3 className="text-[24px] font-normal text-accent-primary">Collateral</h3>
                        <AmountSliderWidget
                          amount={formatAmount(collateralAmount, 8)}
                          currencyIcon="/btc.png"
                          currencyName="Bitcoin"
                          onAmountChange={(e) => setCollateralAmount(parseAmount(e.target.value))}
                          balanceDetails={{
                            balance: maxCollateral.toFixed(4),
                            symbol: "BTC",
                            displayUSD: false,
                          }}
                          sliderValue={collateralAmount}
                          sliderMin={0}
                          sliderMax={maxCollateral}
                          sliderStep={maxCollateral / 1000}
                          onSliderChange={setCollateralAmount}
                          sliderVariant="primary"
                          leftField={{
                            label: "Available",
                            value: `${maxCollateral.toFixed(4)} BTC`,
                          }}
                          rightField={{
                            value: `$${(collateralAmount * btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-[24px] font-normal text-accent-primary">Borrow</h3>
                        <AmountSliderWidget
                          amount={formatAmount(borrowAmount, 2)}
                          currencyIcon="/usdc.png"
                          currencyName="USDC"
                          onAmountChange={(e) => setBorrowAmount(parseAmount(e.target.value))}
                          balanceDetails={{
                            balance: maxBorrow.toLocaleString(),
                            symbol: "USDC",
                            displayUSD: false,
                          }}
                          sliderValue={borrowAmount}
                          sliderMin={0}
                          sliderMax={maxBorrow}
                          sliderStep={maxBorrow / 1000}
                          onSliderChange={setBorrowAmount}
                          sliderVariant="rainbow"
                          leftField={{
                            label: "Max",
                            value: `${maxBorrow.toLocaleString()} USDC`,
                          }}
                          rightField={{
                            value: `$${borrowAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
                          }}
                        />
                      </div>

                      <LoanSummaryCard
                        collateralAmount={collateralAmount}
                        loanAmount={borrowAmount}
                        ltv={ltv}
                        liquidationLtv={liquidationLtv}
                      />

                      <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        fluid
                        disabled={collateralAmount === 0 || borrowAmount === 0}
                        onClick={handleBorrow}
                      >
                        {collateralAmount === 0 || borrowAmount === 0 ? "Enter an amount" : "Borrow"}
                      </Button>
                    </div>
                  ),
                },
                {
                  id: "repay",
                  label: "Repay",
                  content: (
                    <div className="py-8 text-center text-accent-secondary">
                    </div>
                  ),
                },
              ]}
              defaultActiveTab="borrow"
            />
          </Card>
        </div>
      </div>

      {/* Borrow Review Modal */}
      <BorrowReviewModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onConfirm={handleConfirmBorrow}
        collateralAmount={collateralAmount}
        collateralSymbol="BTC"
        collateralUsdValue={`$${(collateralAmount * btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`}
        borrowAmount={borrowAmount}
        borrowSymbol="USDC"
        borrowUsdValue={`$${borrowAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
        borrowApy={6.25}
        ltv={ltv}
        liquidationLtv={liquidationLtv}
        processing={processing}
      />
    </div>
  );
}

