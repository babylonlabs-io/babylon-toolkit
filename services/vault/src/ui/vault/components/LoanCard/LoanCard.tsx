import { Card, Tabs, Button, AmountSlider } from "@babylonlabs-io/core-ui";
import { useState, useMemo } from "react";
import { LoanSummaryCard } from "../LoanSummaryCard";
import { RepaySummaryCard } from "../RepaySummaryCard";

interface LoanCardProps {
  defaultTab?: string;
  
  // Borrow flow props
  maxCollateral: number;
  maxBorrow: number;
  btcPrice: number;
  liquidationLtv: number;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  
  // Repay flow props
  currentLoanAmount: number;
  currentCollateralAmount: number;
  onRepay: (repayAmount: number, withdrawCollateralAmount: number) => void;
}

export function LoanCard({
  defaultTab = 'borrow',
  maxCollateral,
  maxBorrow,
  btcPrice,
  liquidationLtv,
  onBorrow,
  currentLoanAmount,
  currentCollateralAmount,
  onRepay,
}: LoanCardProps) {
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [borrowAmount, setBorrowAmount] = useState(0);
  const [repayAmount, setRepayAmount] = useState(0);
  const [withdrawCollateralAmount, setWithdrawCollateralAmount] = useState(0);
  
  // Hardcoded collateral step arrays
  const borrowCollateralSteps = useMemo(() => {
    const maxBtc = maxCollateral;
    return [
      { value: 0 },
      { value: maxBtc * 0.2 },
      { value: maxBtc * 0.4 },
      { value: maxBtc * 0.6 },
      { value: maxBtc * 0.8 },
      { value: maxBtc },
    ];
  }, [maxCollateral]);
  
  const withdrawCollateralSteps = useMemo(() => {
    const currentBtc = currentCollateralAmount;
    return [
      { value: 0 },
      { value: currentBtc * 0.2 },
      { value: currentBtc * 0.4 },
      { value: currentBtc * 0.6 },
      { value: currentBtc * 0.8 },
      { value: currentBtc },
    ];
  }, [currentCollateralAmount]);

  // Calculate LTV for borrow flow
  const ltv = useMemo(() => {
    if (collateralAmount === 0) return 0;
    const collateralValueUSD = collateralAmount * btcPrice;
    return (borrowAmount / collateralValueUSD) * 100;
  }, [collateralAmount, borrowAmount, btcPrice]);

  // Calculate LTV for repay flow
  const repayLtv = useMemo(() => {
    const remainingCollateral = currentCollateralAmount - withdrawCollateralAmount;
    if (remainingCollateral === 0) return 0;
    const remainingCollateralValueUSD = remainingCollateral * btcPrice;
    const remainingLoan = currentLoanAmount - repayAmount;
    return (remainingLoan / remainingCollateralValueUSD) * 100;
  }, [currentCollateralAmount, withdrawCollateralAmount, currentLoanAmount, repayAmount, btcPrice]);

  return (
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
                  <AmountSlider
                    amount={collateralAmount}
                    currencyIcon="/btc.png"
                    currencyName="Bitcoin"
                    balanceDetails={{
                      balance: maxCollateral.toFixed(4),
                      symbol: "BTC",
                      displayUSD: false,
                    }}
                    sliderValue={collateralAmount}
                    sliderMin={0}
                    sliderMax={maxCollateral}
                    sliderStep={maxCollateral / 1000}
                    sliderSteps={borrowCollateralSteps}
                    onSliderChange={setCollateralAmount}
                    onSliderStepsChange={(selectedSteps) => {
                      console.log('Borrow Collateral - Selected steps:', selectedSteps);
                      // Handle cumulative step selection here
                    }}
                    sliderVariant="primary"
                    leftField={{
                      label: "Max",
                      value: `${maxCollateral.toFixed(4)} BTC`,
                    }}
                    onMaxClick={() => setCollateralAmount(maxCollateral)}
                    rightField={{
                      value: `$${(collateralAmount * btcPrice).toLocaleString(undefined, { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })} USD`,
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="text-[24px] font-normal text-accent-primary">Borrow</h3>
                  <AmountSlider
                    amount={borrowAmount}
                    currencyIcon="/usdc.png"
                    currencyName="USDC"
                    onAmountChange={(e) => setBorrowAmount(parseFloat(e.target.value) || 0)}
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
                    onMaxClick={() => setBorrowAmount(maxBorrow)}
                    rightField={{
                      value: `$${borrowAmount.toLocaleString(undefined, { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })} USD`,
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
                  onClick={() => onBorrow(collateralAmount, borrowAmount)}
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-[24px] font-normal text-accent-primary">Repay</h3>
                  <AmountSlider
                    amount={repayAmount}
                    currencyIcon="/usdc.png"
                    currencyName="USDC"
                    onAmountChange={(e) => setRepayAmount(parseFloat(e.target.value) || 0)}
                    balanceDetails={{
                      balance: currentLoanAmount.toLocaleString(),
                      symbol: "USDC",
                      displayUSD: false,
                    }}
                    sliderValue={repayAmount}
                    sliderMin={0}
                    sliderMax={currentLoanAmount}
                    sliderStep={currentLoanAmount / 1000}
                    onSliderChange={setRepayAmount}
                    sliderVariant="primary"
                    sliderActiveColor="#0B53BF"
                    leftField={{
                      label: "Max",
                      value: `${currentLoanAmount.toLocaleString()} USDC`,
                    }}
                    onMaxClick={() => setRepayAmount(currentLoanAmount)}
                    rightField={{
                      value: `$${repayAmount.toLocaleString(undefined, { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })} USD`,
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="text-[24px] font-normal text-accent-primary">Withdraw Collateral</h3>
                  <AmountSlider
                    amount={withdrawCollateralAmount}
                    currencyIcon="/btc.png"
                    currencyName="Bitcoin"
                    balanceDetails={{
                      balance: currentCollateralAmount.toFixed(4),
                      symbol: "BTC",
                      displayUSD: false,
                    }}
                    sliderValue={withdrawCollateralAmount}
                    sliderMin={0}
                    sliderMax={currentCollateralAmount}
                    sliderStep={currentCollateralAmount / 1000}
                    sliderSteps={withdrawCollateralSteps}
                    onSliderChange={setWithdrawCollateralAmount}
                    onSliderStepsChange={(selectedSteps: number[]) => {
                      console.log('Withdraw Collateral - Selected steps:', selectedSteps);
                      // Handle cumulative step selection here
                    }}
                    sliderVariant="primary"
                    leftField={{
                      label: "Max",
                      value: `${currentCollateralAmount.toFixed(4)} BTC`,
                    }}
                    onMaxClick={() => setWithdrawCollateralAmount(currentCollateralAmount)}
                    rightField={{
                      value: `$${(withdrawCollateralAmount * btcPrice).toLocaleString(undefined, { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })} USD`,
                    }}
                  />
                </div>

                <RepaySummaryCard
                  currentLoanAmount={currentLoanAmount}
                  repayAmount={repayAmount}
                  ltv={repayLtv}
                  liquidationLtv={liquidationLtv}
                />

                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  fluid
                  disabled={repayAmount === 0 && withdrawCollateralAmount === 0}
                  onClick={() => onRepay(repayAmount, withdrawCollateralAmount)}
                >
                  {repayAmount === 0 && withdrawCollateralAmount === 0 ? "Enter an amount" : "Repay and Withdraw"}
                </Button>
              </div>
            ),
          },
        ]}
        defaultActiveTab={defaultTab}
      />
    </Card>
  );
}

