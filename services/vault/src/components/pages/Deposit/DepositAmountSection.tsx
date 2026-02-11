import {
  AmountItem,
  Card,
  CheckIcon,
  SubSection,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";
import { getNetworkConfigBTC } from "@/config";

import { depositService } from "../../../services/deposit";
import { PriceWarningBanner } from "../../shared";

const btcConfig = getNetworkConfigBTC();

interface DepositAmountSectionProps {
  amount: string;
  btcBalance: bigint;
  btcPrice: number;
  error?: string;
  completed?: boolean;
  onAmountChange: (value: string) => void;
  onAmountBlur?: () => void;
  onMaxClick: () => void;
  priceMetadata?: Record<string, PriceMetadata>;
  hasStalePrices?: boolean;
  hasPriceFetchError?: boolean;
  // Multi-vault POC props
  numVaults?: number;
  autoSplit?: boolean;
  vaultAmounts?: string[];
  onNumVaultsChange?: (num: number) => void;
  onAutoSplitChange?: (auto: boolean) => void;
  onVaultAmountChange?: (index: number, amount: string) => void;
}

export function DepositAmountSection({
  amount,
  btcBalance,
  btcPrice,
  error,
  completed,
  onAmountChange,
  onAmountBlur,
  onMaxClick,
  priceMetadata = {},
  hasStalePrices = false,
  hasPriceFetchError = false,
  // Multi-vault POC props
  numVaults = 1,
  autoSplit = true,
  vaultAmounts = [],
  onNumVaultsChange,
  onAutoSplitChange,
  onVaultAmountChange,
}: DepositAmountSectionProps) {
  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance, 8));
  }, [btcBalance]);

  const amountUsd = useMemo(() => {
    // Don't show USD if price fetch failed
    if (hasPriceFetchError) return "";
    if (!btcPrice || !amount || amount === "0") return "";
    const btcNum = parseFloat(amount);
    if (isNaN(btcNum)) return "";
    const usdValue = btcNum * btcPrice;
    return `$${usdValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [amount, btcPrice, hasPriceFetchError]);

  const showPriceWarning = hasStalePrices || hasPriceFetchError;

  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
        1. Deposit
        {completed && <CheckIcon size={26} variant="success" />}
      </h3>
      <SubSection className="flex w-full flex-col gap-2">
        {showPriceWarning && (
          <PriceWarningBanner
            metadata={priceMetadata}
            hasPriceFetchError={hasPriceFetchError}
            hasStalePrices={hasStalePrices}
          />
        )}
        {/* Wrapper div captures blur from AmountItem's internal input */}
        <div onBlur={onAmountBlur}>
          <AmountItem
            amount={amount}
            amountUsd={amountUsd}
            currencyIcon={btcConfig.icon}
            currencyName={btcConfig.name}
            placeholder="Enter amount"
            displayBalance={true}
            balanceDetails={{
              balance: btcBalanceFormatted,
              symbol: btcConfig.coinSymbol,
              price: btcPrice,
              displayUSD: btcConfig.displayUSD && !hasPriceFetchError,
              decimals: 4,
            }}
            min="0"
            step="any"
            autoFocus={false}
            onChange={(e) => onAmountChange(e.target.value)}
            onMaxClick={onMaxClick}
          />
        </div>
        {error && <p className="text-sm text-error-main">{error}</p>}

        {/* POC: Multi-Vault Configuration */}
        <div className="mt-4 space-y-3 border-t border-secondary-main/20 pt-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-accent-primary">
              Number of Vaults:
            </label>
            <input
              type="number"
              max="10"
              value={numVaults}
              onChange={(e) => {
                const val = e.target.value;
                // Allow empty string during editing
                if (val === "") {
                  onNumVaultsChange?.(0);
                  return;
                }
                const num = parseInt(val);
                // Only accept valid numbers
                if (!isNaN(num) && num >= 0) {
                  onNumVaultsChange?.(num);
                }
              }}
              onBlur={(e) => {
                // On blur, enforce minimum of 1
                const num = parseInt(e.target.value);
                if (isNaN(num) || num < 1) {
                  onNumVaultsChange?.(1);
                }
              }}
              className="w-20 rounded border border-secondary-main/30 bg-secondary-contrast/10 px-3 py-2 text-accent-primary"
            />
            {numVaults > 1 && (
              <span className="text-xs text-accent-secondary">
                (Will create {numVaults} separate vaults)
              </span>
            )}
          </div>

          {numVaults > 1 && (
            <>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-accent-primary">
                  <input
                    type="checkbox"
                    checked={autoSplit}
                    onChange={(e) => onAutoSplitChange?.(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Auto-split equally
                </label>
              </div>

              {!autoSplit && (
                <div className="space-y-2">
                  <p className="text-xs text-accent-secondary">
                    Manual vault amounts (must sum to total):
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: numVaults }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <label className="whitespace-nowrap text-xs text-accent-secondary">
                          Vault {i + 1}:
                        </label>
                        <input
                          type="text"
                          placeholder="0.00"
                          value={vaultAmounts[i] || ""}
                          onChange={(e) =>
                            onVaultAmountChange?.(i, e.target.value)
                          }
                          className="flex-1 rounded border border-secondary-main/30 bg-secondary-contrast/10 px-2 py-1 text-sm text-accent-primary"
                        />
                        <span className="text-xs text-accent-secondary">
                          BTC
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SubSection>
    </Card>
  );
}
