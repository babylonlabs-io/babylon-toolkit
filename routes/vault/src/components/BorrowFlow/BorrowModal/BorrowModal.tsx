import {
  Button,
  Dialog,
  MobileDialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
  useIsMobile,
  AmountItem,
  SubSection,
  Loader,
} from "@babylonlabs-io/core-ui";
import { useMemo, useState, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { useBorrowForm } from "./useBorrowForm";
import { useMarketsWithValidation } from "./useMarketsWithValidation";
import { usdcIcon } from "../../../assets";
import { type Hex } from "viem";
import { useAvailableCollaterals } from "./useAvailableCollaterals";

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
  children?: ReactNode;
}

function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
  const isMobileView = useIsMobile(640);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  return (
    <DialogComponent {...restProps} className={twMerge("w-[41.25rem] max-w-full", className)} />
  );
}

interface BorrowModalProps {
  open: boolean;
  onClose: () => void;
  onBorrow?: (amount: number, marketId: string, selectedCollateralTxHashes: Hex[]) => void;
  /** User's Ethereum address to fetch available collaterals */
  connectedAddress?: Hex;
}

export function BorrowModal({ open, onClose, onBorrow, connectedAddress }: BorrowModalProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [selectedCollateralTxHashes, setSelectedCollateralTxHashes] = useState<Set<Hex>>(new Set());

  // Fetch markets from API and validate them on-chain with Morpho SDK
  const { data: marketsData, isLoading: isLoadingMarkets, error: marketsError } = useMarketsWithValidation();
  const markets = marketsData?.markets || [];
  const hasInvalidMarkets = marketsData && !marketsData.allValid;

  // Fetch available collaterals (status === 2)
  const { availableCollaterals, isLoading: isLoadingCollaterals } = useAvailableCollaterals(connectedAddress);

  // Calculate total collateral from selected items
  const totalCollateralBTC = useMemo(() => {
    return availableCollaterals
      .filter(c => selectedCollateralTxHashes.has(c.txHash))
      .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);
  }, [availableCollaterals, selectedCollateralTxHashes]);

  const {
    borrowAmount,
    borrowAmountNum,
    inputState,
    maxBorrow,
    collateralValueUSD,
    currentLTV,
    validation,
    hintText,
    btcPriceUSD,
    usdcPriceUSD,
    maxLTV,
    liquidationLTV,
    handleInputChange,
    setTouched,
    formatUSD,
    formatPercentage,
  } = useBorrowForm(totalCollateralBTC);

  // Handle key down to prevent arrow keys
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  // Handle collateral selection toggle
  const handleToggleCollateral = (txHash: Hex) => {
    setSelectedCollateralTxHashes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(txHash)) {
        newSet.delete(txHash);
      } else {
        newSet.add(txHash);
      }
      return newSet;
    });
  };

  // Handle market selection toggle
  const handleToggleMarket = (marketId: string) => {
    setSelectedMarketId(marketId === selectedMarketId ? null : marketId);
  };

  // Handle borrow button click
  const handleBorrowClick = async () => {
    setTouched(true);
    if (validation.isValid && borrowAmountNum > 0 && selectedMarketId && selectedCollateralTxHashes.size > 0) {
      if (onBorrow) {
        onBorrow(borrowAmountNum, selectedMarketId, Array.from(selectedCollateralTxHashes));
      }
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader title="Borrow" onClose={onClose} className="text-accent-primary" />
      <DialogBody className="no-scrollbar text-accent-primary mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 sm:px-6">
        {/* Collateral Selection Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Text variant="subtitle1" className="text-accent-primary text-base font-semibold sm:text-lg">
              Select Collateral
            </Text>
            <Text variant="body2" className="text-accent-secondary text-sm sm:text-base">
              Choose which deposits to use as collateral (you can select multiple)
            </Text>
          </div>

          {isLoadingCollaterals ? (
            <div className="flex items-center justify-center py-8">
              <Loader size={32} className="text-primary-main" />
            </div>
          ) : availableCollaterals.length === 0 ? (
            <div className="bg-secondary-highlight rounded-lg p-4">
              <Text variant="body2" className="text-accent-secondary text-sm">
                No available collateral found. Please deposit BTC first.
              </Text>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {availableCollaterals.map((collateral) => {
                const isSelected = selectedCollateralTxHashes.has(collateral.txHash);

                return (
                  <div
                    key={collateral.txHash}
                    className="bg-secondary-highlight flex items-center justify-between rounded-lg p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <Text variant="body1" className="text-accent-primary text-sm font-medium sm:text-base">
                        {collateral.amount} {collateral.symbol}
                      </Text>
                      <Text variant="body2" className="text-accent-secondary text-xs sm:text-sm">
                        {formatUSD(parseFloat(collateral.amount) * btcPriceUSD)}
                      </Text>
                    </div>
                    <Button
                      size="small"
                      variant={isSelected ? "contained" : "outlined"}
                      color="primary"
                      onClick={() => handleToggleCollateral(collateral.txHash)}
                      className="min-w-[80px] text-xs sm:text-sm"
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total Collateral Summary */}
          {selectedCollateralTxHashes.size > 0 && (
            <div className="bg-primary-light/10 border-primary-main flex items-center justify-between rounded-lg border p-3">
              <Text variant="body2" className="text-accent-secondary text-sm">
                Total Collateral Selected:
              </Text>
              <Text variant="body1" className="text-accent-primary text-sm font-semibold">
                {totalCollateralBTC.toFixed(4)} BTC ({formatUSD(collateralValueUSD)})
              </Text>
            </div>
          )}
        </div>

        {/* Market Selection Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Text variant="subtitle1" className="text-accent-primary text-base font-semibold sm:text-lg">
              Select Market
            </Text>
            <Text variant="body2" className="text-accent-secondary text-sm sm:text-base">
              Choose a lending market for your loan
            </Text>
          </div>

          {isLoadingMarkets ? (
            <div className="flex items-center justify-center py-8">
              <Loader size={32} className="text-primary-main" />
            </div>
          ) : marketsError ? (
            <div className="bg-error/10 rounded-lg p-4">
              <Text variant="body2" className="text-error text-sm">
                Failed to load markets. Please try again.
              </Text>
            </div>
          ) : (
            <>
              {/* Show warning if some markets failed validation */}
              {hasInvalidMarkets && (
                <div className="bg-error/10 border-error border rounded-lg p-4">
                  <Text variant="body2" className="text-error text-sm font-semibold mb-2">
                    Market Configuration Error
                  </Text>
                  <Text variant="body2" className="text-error text-xs">
                    Some markets from the API don't exist on the Morpho contract. Check console for details.
                  </Text>
                  {marketsData?.invalidMarkets.map((market) => (
                    <Text key={market.id} variant="body2" className="text-error text-xs mt-1">
                      • Market ID: {market.id.slice(0, 10)}... - {market.validationError}
                    </Text>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-3">
                {markets.map((market) => {
                  const isSelected = selectedMarketId === market.id;
                  // Calculate LLTV percentage (lltv has 18 decimals)
                  const lltvPercent = (Number(market.lltv) / 1e18 * 100).toFixed(2);
                  // Format market display: show last 6 chars of addresses for brevity
                  const loanToken = market.loan_token.slice(0, 6) + '...' + market.loan_token.slice(-4);
                  const collateralToken = market.collateral_token.slice(0, 6) + '...' + market.collateral_token.slice(-4);

                  // Format on-chain data if available
                  const totalSupply = market.onChainData
                    ? (Number(market.onChainData.totalSupplyAssets) / 1e6).toFixed(2)
                    : 'N/A';
                  const utilization = market.onChainData
                    ? market.onChainData.utilizationPercent.toFixed(2)
                    : 'N/A';

                  return (
                    <div
                      key={market.id}
                      className={twMerge(
                        "bg-secondary-highlight flex flex-col gap-2 rounded-lg p-4",
                        !market.isValid && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <Text variant="body1" className="text-accent-primary text-sm font-medium sm:text-base">
                            Collateral: {collateralToken}
                          </Text>
                          <Text variant="body2" className="text-accent-secondary text-xs sm:text-sm">
                            Loan: {loanToken} • LLTV: {lltvPercent}%
                          </Text>
                          {market.isValid && market.onChainData && (
                            <Text variant="body2" className="text-accent-secondary text-xs">
                              Supply: {totalSupply} USDC • Utilization: {utilization}%
                            </Text>
                          )}
                        </div>
                        <Button
                          size="small"
                          variant={isSelected ? "contained" : "outlined"}
                          color="primary"
                          onClick={() => handleToggleMarket(market.id)}
                          className="min-w-[80px] text-xs sm:text-sm"
                          disabled={!market.isValid}
                        >
                          {!market.isValid ? "Invalid" : isSelected ? "Selected" : "Select"}
                        </Button>
                      </div>
                      {!market.isValid && (
                        <Text variant="body2" className="text-error text-xs">
                          ⚠️ {market.validationError}
                        </Text>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Borrow Section */}
        <div className="flex flex-col gap-2">
          <h3 className="text-accent-primary text-base font-semibold sm:text-lg">
            Borrow
          </h3>
          <Text variant="body2" className="text-accent-secondary text-sm sm:text-base">
            Enter the amount you want to borrow
          </Text>
        </div>

        {/* Borrow Amount Input */}
        <SubSection className="flex w-full flex-col content-center justify-between gap-4">
          <AmountItem
            amount={borrowAmount}
            currencyIcon={usdcIcon}
            currencyName="USDC"
            placeholder="0"
            displayBalance={true}
            balanceDetails={{
              balance: maxBorrow.toFixed(0),
              symbol: "USDC",
              price: usdcPriceUSD,
              displayUSD: true,
            }}
            min="0"
            step="any"
            autoFocus={true}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            amountUsd={formatUSD(borrowAmountNum)}
            subtitle={`Max: ${maxBorrow.toFixed(0)} USDC`}
          />
          {hintText && (
            <Text
              variant="body2"
              className={twMerge(
                "text-xs sm:text-sm -mt-2",
                inputState === "error" && "text-error-main",
                inputState === "warning" && "text-warning-main"
              )}
            >
              {hintText}
            </Text>
          )}
        </SubSection>

        {/* Metrics Card */}
        <div className="bg-secondary-highlight flex flex-col gap-3 rounded p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary shrink-0 text-xs sm:text-sm">
              Collateral
            </Text>
            <Text variant="body1" className="truncate text-right text-xs font-medium sm:text-sm">
              {totalCollateralBTC.toFixed(4)} BTC ({formatUSD(collateralValueUSD)})
            </Text>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary shrink-0 text-xs sm:text-sm">
              Loan
            </Text>
            <Text variant="body1" className="truncate text-right text-xs font-medium sm:text-sm">
              {borrowAmount || "0"} USDC ({formatUSD(borrowAmountNum)})
            </Text>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary shrink-0 text-xs sm:text-sm">
              LTV
            </Text>
            <Text
              variant="body1"
              className={twMerge(
                "font-medium text-xs sm:text-sm",
                currentLTV > 50 && "text-warning-main",
                currentLTV > maxLTV * 100 && "text-error-main"
              )}
            >
              {totalCollateralBTC > 0 ? formatPercentage(currentLTV) : "—"}
            </Text>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary shrink-0 text-xs sm:text-sm">
              Liquidation LTV
            </Text>
            <Text variant="body1" className="text-xs font-medium sm:text-sm">
              {formatPercentage(liquidationLTV * 100)}
            </Text>
          </div>
        </div>
      </DialogBody>
      <DialogFooter className="flex flex-col gap-4 pb-8 pt-0">
        <Button
          variant="contained"
          color="primary"
          onClick={handleBorrowClick}
          className="w-full"
          disabled={
            !validation.isValid ||
            borrowAmountNum === 0 ||
            !selectedMarketId ||
            selectedCollateralTxHashes.size === 0
          }
        >
          {selectedCollateralTxHashes.size === 0
            ? "Select Collateral"
            : !selectedMarketId
            ? "Select Market"
            : "Borrow"}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
