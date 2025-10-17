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
import { useMemo, useEffect, useState, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { useBorrowForm } from "./useBorrowForm";
import { useMarkets } from "./useMarkets";
import { usdcIcon } from "../../../assets";
import type { Hex } from "viem";
import { isPeginReadyToMint } from "../../../clients/eth-contract/vault-controller/query";
import { CONTRACTS } from "../../../config/contracts";
import type { MorphoMarket } from "../../../clients/vault-api/types";

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
  onBorrow?: (amount: number, marketId: string) => void;
  collateral: {
    amount: string;
    symbol: string;
    icon?: string | ReactNode;
  };
  marketData?: {
    btcPriceUSD: number;
    lltvPercent: number;
  };
  /** Pegin transaction hash to check if ready to mint */
  pegInTxHash?: Hex;
}

export function BorrowModal({ open, onClose, onBorrow, collateral, marketData, pegInTxHash }: BorrowModalProps) {
  const [isReadyToMint, setIsReadyToMint] = useState<boolean | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  // Fetch markets from API
  const { data: marketsData, isLoading: isLoadingMarkets, error: marketsError } = useMarkets();
  const markets = marketsData?.markets || [];

  const collateralBTC = useMemo(
    () => parseFloat(collateral.amount || "0"),
    [collateral.amount]
  );

  const collateralIconUrl = useMemo(() => {
    if (typeof collateral.icon === "string") {
      return collateral.icon;
    }
    return "";
  }, [collateral.icon]);

  // Check if pegin is ready to mint when modal opens
  useEffect(() => {
    const checkPeginReadiness = async () => {
      if (!open || !pegInTxHash) {
        setIsReadyToMint(null);
        return;
      }

      setCheckingReadiness(true);
      try {
        const ready = await isPeginReadyToMint(CONTRACTS.VAULT_CONTROLLER, pegInTxHash);
        setIsReadyToMint(ready);
      } catch (error) {
        setIsReadyToMint(false);
      } finally {
        setCheckingReadiness(false);
      }
    };

    checkPeginReadiness();
  }, [open, pegInTxHash]);

  const {
    borrowAmount,
    borrowAmountNum,
    processing,
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
    handleBorrow,
    setTouched,
    formatUSD,
    formatPercentage,
  } = useBorrowForm(collateralBTC, marketData);

  // Handle key down to prevent arrow keys
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  // Handle input change for collateral (read-only)
  const handleCollateralChange = () => {
    // No-op, collateral is read-only
  };

  // Handle market selection toggle
  const handleToggleMarket = (marketId: string) => {
    setSelectedMarketId(marketId === selectedMarketId ? null : marketId);
  };

  // Handle borrow button click
  const handleBorrowClick = async () => {
    setTouched(true);
    if (validation.isValid && borrowAmountNum > 0 && selectedMarketId) {
      // Call parent callback to trigger sign modal flow
      if (onBorrow) {
        onBorrow(borrowAmountNum, selectedMarketId);
      } else {
        // Fallback: if no onBorrow callback, use old flow
        await handleBorrow(borrowAmountNum);
        onClose();
      }
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader title="Collateral" onClose={onClose} className="text-accent-primary" />
      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto text-accent-primary px-4 sm:px-6">
        {/* Subtitle */}
        <Text variant="body2" className="text-accent-secondary -mt-2 text-sm sm:text-base">
          Your locked BTC collateral
        </Text>

        {/* Collateral Display */}
        <SubSection className="flex w-full flex-col content-center justify-between gap-4">
          <AmountItem
            amount={collateral.amount}
            currencyIcon={collateralIconUrl}
            currencyName="BTC"
            placeholder=""
            displayBalance={true}
            balanceDetails={{
              balance: parseFloat(collateral.amount).toFixed(2),
              symbol: "BTC",
              price: btcPriceUSD,
              displayUSD: true,
            }}
            min="0"
            step="any"
            autoFocus={false}
            onChange={handleCollateralChange}
            onKeyDown={handleKeyDown}
            amountUsd={formatUSD(collateralValueUSD)}
            subtitle={`Balance: ${parseFloat(collateral.amount).toFixed(2)} BTC`}
            disabled={true}
          />
        </SubSection>

        {/* Market Selection Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Text variant="subtitle1" className="text-base font-semibold text-accent-primary sm:text-lg">
              Select Market
            </Text>
            <Text variant="body2" className="text-sm text-accent-secondary sm:text-base">
              Choose a lending market for your loan
            </Text>
          </div>

          {isLoadingMarkets ? (
            <div className="flex items-center justify-center py-8">
              <Loader size={32} className="text-primary-main" />
            </div>
          ) : marketsError ? (
            <div className="rounded-lg bg-error/10 p-4">
              <Text variant="body2" className="text-sm text-error">
                Failed to load markets. Please try again.
              </Text>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {markets.map((market: MorphoMarket) => {
                const isSelected = selectedMarketId === market.id;
                // Calculate LLTV percentage (lltv has 18 decimals)
                const lltvPercent = (Number(market.lltv) / 1e18 * 100).toFixed(2);
                // Format market display: show last 6 chars of addresses for brevity
                const loanToken = market.loan_token.slice(0, 6) + '...' + market.loan_token.slice(-4);
                const collateralToken = market.collateral_token.slice(0, 6) + '...' + market.collateral_token.slice(-4);

                return (
                  <div
                    key={market.id}
                    className="flex items-center justify-between rounded-lg bg-secondary-highlight p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <Text variant="body1" className="text-sm font-medium text-accent-primary sm:text-base">
                        Collateral: {collateralToken}
                      </Text>
                      <Text variant="body2" className="text-xs text-accent-secondary sm:text-sm">
                        Loan: {loanToken} • LLTV: {lltvPercent}%
                      </Text>
                    </div>
                    <Button
                      size="small"
                      variant={isSelected ? "contained" : "outlined"}
                      color="primary"
                      onClick={() => handleToggleMarket(market.id)}
                      className="min-w-[80px] text-xs sm:text-sm"
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Borrow Section */}
        <div className="flex flex-col gap-2">
          <h3 className="text-base sm:text-lg font-semibold text-accent-primary">
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
        <div className="flex flex-col gap-3 p-3 sm:p-4 bg-secondary-highlight rounded">
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary text-xs sm:text-sm shrink-0">
              Collateral
            </Text>
            <Text variant="body1" className="font-medium text-xs sm:text-sm text-right truncate">
              {collateral.amount} BTC ({formatUSD(collateralValueUSD)})
            </Text>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary text-xs sm:text-sm shrink-0">
              Loan
            </Text>
            <Text variant="body1" className="font-medium text-xs sm:text-sm text-right truncate">
              {borrowAmount || "0"} USDC ({formatUSD(borrowAmountNum)})
            </Text>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary text-xs sm:text-sm shrink-0">
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
              {formatPercentage(currentLTV)}
            </Text>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text variant="body2" className="text-accent-secondary text-xs sm:text-sm shrink-0">
              Liquidation LTV
            </Text>
            <Text variant="body1" className="font-medium text-xs sm:text-sm">
              {formatPercentage(liquidationLTV * 100)}
            </Text>
          </div>
        </div>
      </DialogBody>
      <DialogFooter className="flex flex-col gap-4 pb-8 pt-0">
        {/* Warning message if pegin is not ready */}
        {isReadyToMint === false && (
          <Text variant="body2" className="text-warning-main text-sm text-center">
            Vault is not ready to borrow. Please wait for the vault provider to verify your BTC deposit.
          </Text>
        )}

        <Button
          variant="contained"
          color="primary"
          onClick={handleBorrowClick}
          className="w-full"
          disabled={
            !validation.isValid ||
            borrowAmountNum === 0 ||
            !selectedMarketId ||
            processing ||
            checkingReadiness ||
            isReadyToMint === false
          }
        >
          {checkingReadiness
            ? "Checking..."
            : processing
            ? "Processing..."
            : isReadyToMint === false
            ? "Not Ready to Borrow"
            : !selectedMarketId
            ? "Select Market"
            : "Borrow"}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
