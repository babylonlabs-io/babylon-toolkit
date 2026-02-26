import { Avatar, Button, Slider } from "@babylonlabs-io/core-ui";
import { IoChevronDown, IoWarningOutline } from "react-icons/io5";

import { HeartIcon, InfoIcon } from "@/components/shared";

import { type BorrowFormState, useBorrowFormState } from "./useBorrowFormState";

interface BorrowFormProps {
  onChangeAsset: () => void;
  onBorrowSuccess: (amount: number, symbol: string, icon: string) => void;
}

function LabelWithInfo({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      {children}
      <InfoIcon />
    </span>
  );
}

export function BorrowForm({
  onChangeAsset,
  onBorrowSuccess,
}: BorrowFormProps) {
  const state = useBorrowFormState({ onBorrowSuccess });

  return <BorrowFormView state={state} onChangeAsset={onChangeAsset} />;
}

interface BorrowFormViewProps {
  state: BorrowFormState;
  onChangeAsset: () => void;
}

function BorrowFormView({ state, onChangeAsset }: BorrowFormViewProps) {
  return (
    <div className="mx-auto w-full max-w-[520px]">
      {/* Token Input Card */}
      <div className="bg-primary-surface rounded-lg p-6 dark:bg-[#202020]">
        {/* Top row: Token pill + Amount input */}
        <div className="flex items-center justify-between gap-4">
          {/* Token selector pill */}
          <button
            onClick={onChangeAsset}
            className="flex items-center gap-2 rounded-full bg-primary-contrast/10 px-3 py-2 transition-colors hover:bg-primary-contrast/20 dark:bg-[#333] dark:hover:bg-[#444]"
          >
            <Avatar
              url={state.currencyIcon}
              alt={state.assetSymbol}
              size="small"
            />
            <span className="text-sm font-medium text-accent-primary">
              {state.assetSymbol}
            </span>
            <IoChevronDown className="text-accent-secondary" size={14} />
          </button>

          {/* Amount input */}
          <input
            type="text"
            inputMode="decimal"
            value={state.borrowAmount === 0 ? "" : state.borrowAmount}
            onChange={state.handleAmountChange}
            placeholder="0"
            className="w-full min-w-0 bg-transparent text-right text-2xl font-normal text-accent-primary outline-none placeholder:text-accent-secondary"
          />
        </div>

        {/* Rainbow slider */}
        <div className="mt-4">
          <Slider
            value={state.borrowAmount}
            min={0}
            max={state.sliderMax}
            step={state.sliderMax / 1000}
            steps={[]}
            onChange={state.setBorrowAmount}
            variant="rainbow"
            activeColor={state.tokenBrandColor}
          />
        </div>

        {/* Bottom row: Max + max amount | USD equivalent */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={state.handleMaxClick}
              className="rounded bg-secondary-main/10 px-2 py-0.5 text-xs font-medium text-secondary-main transition-colors hover:bg-secondary-main/20"
            >
              Max
            </button>
            <span className="text-sm text-accent-secondary">
              {state.maxAmountFormatted}
            </span>
          </div>
          <span className="text-sm text-accent-secondary">
            {state.usdValueFormatted}
          </span>
        </div>

        {/* Liquidation warning */}
        {state.showLiquidationWarning && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-warning-main/30 bg-warning-main/5 px-4 py-3">
            <IoWarningOutline
              className="shrink-0 text-warning-main"
              size={20}
            />
            <span className="text-sm text-warning-main">
              At Risk of Liquidation
            </span>
          </div>
        )}
      </div>

      {/* Details Card */}
      <div className="bg-primary-surface mt-4 rounded-lg p-6 dark:bg-[#202020]">
        <div className="flex flex-col gap-3">
          {/* Balance */}
          <div className="flex items-center justify-between">
            <LabelWithInfo>Balance</LabelWithInfo>
            <span className="text-sm text-accent-primary">
              {state.balanceFormatted}
            </span>
          </div>

          {/* Borrow rate */}
          <div className="flex items-center justify-between">
            <LabelWithInfo>Borrow rate</LabelWithInfo>
            <span className="text-sm text-accent-primary">
              {state.borrowRatioOriginal ? (
                <span className="flex items-center gap-2">
                  <span className="text-accent-secondary">
                    {state.borrowRatioOriginal}
                  </span>
                  <span className="text-accent-secondary">&rarr;</span>
                  <span>{state.borrowRatio}</span>
                </span>
              ) : (
                state.borrowRatio
              )}
            </span>
          </div>

          {/* Health Factor */}
          <div className="flex items-center justify-between">
            <LabelWithInfo>Health Factor</LabelWithInfo>
            <span className="text-sm text-accent-primary">
              {state.healthFactorOriginal ? (
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-accent-secondary">
                    <HeartIcon
                      color={
                        state.healthFactorOriginalColor ??
                        state.healthFactorColor
                      }
                    />
                    {state.healthFactorOriginal}
                  </span>
                  <span className="text-accent-secondary">&rarr;</span>
                  <span className="flex items-center gap-1">
                    <HeartIcon color={state.healthFactorColor} />
                    {state.healthFactor}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <HeartIcon color={state.healthFactorColor} />
                  {state.healthFactor}
                </span>
              )}
            </span>
          </div>

          {/* Liquidation LTV */}
          <div className="flex items-center justify-between">
            <LabelWithInfo>Liquidation LTV</LabelWithInfo>
            <span className="text-sm text-accent-primary">
              {state.liquidationLtvFormatted}
            </span>
          </div>
        </div>
      </div>

      {/* Borrow Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={
          state.isDisabled || state.isProcessing || !state.isBorrowEnabled
        }
        onClick={state.handleBorrow}
        className="mt-6"
      >
        {state.buttonText}
      </Button>

      {/* Fees Section */}
      <div className="mt-4 space-y-2 text-sm text-accent-secondary">
        <div className="flex items-center justify-between">
          <span>Ethereum Network Fee</span>
          {/* TODO: Add network fee */}
          <span>0 ETH ($0 USD)</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Protocol Fee</span>
          {/* TODO: Add protocol fee */}
          <span>0 ETH ($0 USD)</span>
        </div>
      </div>
    </div>
  );
}
