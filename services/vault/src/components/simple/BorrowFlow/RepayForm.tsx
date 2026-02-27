import { Avatar, Button, Slider } from "@babylonlabs-io/core-ui";
import { IoChevronDown } from "react-icons/io5";

import { HeartIcon, LabelWithInfo } from "@/components/shared";

import { type RepayFormState, useRepayFormState } from "./useRepayFormState";

interface RepayFormProps {
  onChangeAsset: () => void;
  onRepaySuccess: (amount: number, symbol: string, icon: string) => void;
}

export function RepayForm({ onChangeAsset, onRepaySuccess }: RepayFormProps) {
  const state = useRepayFormState({ onRepaySuccess });

  return <RepayFormView state={state} onChangeAsset={onChangeAsset} />;
}

interface RepayFormViewProps {
  state: RepayFormState;
  onChangeAsset: () => void;
}

function RepayFormView({ state, onChangeAsset }: RepayFormViewProps) {
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
            value={state.repayAmount === 0 ? "" : state.repayAmount}
            onChange={state.handleAmountChange}
            placeholder="0"
            className="w-full min-w-0 bg-transparent text-right text-2xl font-normal text-accent-primary outline-none placeholder:text-accent-secondary"
          />
        </div>

        {/* Rainbow slider */}
        <div className="mt-4">
          <Slider
            value={state.repayAmount}
            min={0}
            max={state.sliderMax}
            step={state.sliderMax / 1000}
            steps={[]}
            onChange={state.setRepayAmount}
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

          {/* Interest (borrow rate) */}
          <div className="flex items-center justify-between">
            <LabelWithInfo>Interest</LabelWithInfo>
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

      {/* Error message */}
      {state.errorMessage && (
        <p className="mt-2 text-sm text-error-main">{state.errorMessage}</p>
      )}

      {/* Repay Button */}
      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        disabled={state.isDisabled || state.isProcessing}
        onClick={state.handleRepay}
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
