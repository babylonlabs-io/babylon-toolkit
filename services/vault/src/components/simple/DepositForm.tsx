import { AmountSlider, Card } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { depositService } from "@/services/deposit";
import type { VaultProviderListItem } from "@/types/vaultProvider";

import { CollateralFactorRow } from "./CollateralFactorRow";
import { DepositFeesBreakdown } from "./DepositFeesBreakdown";
import { FeesSection, type FeeRow } from "./FeesSection";
import { UtxoSplitSelector } from "./UtxoSplitSelector";
import { VaultProviderSelector } from "./VaultProviderSelector";

const btcConfig = getNetworkConfigBTC();

interface Application {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface PartialLiquidationProps {
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  canSplit: boolean;
  isLoading: boolean;
  splitRatioLabel: string | null;
}

interface DepositFormProps {
  amount: string;
  amountSats: bigint;
  btcBalance: bigint;
  minDeposit: bigint;
  maxDeposit?: bigint;
  /**
   * Fee-adjusted maximum depositable amount in satoshis: the wallet balance
   * minus the BTC network fee (and the depositor claim value once a provider
   * is selected). The slider and the "Max" field cap at this value so the user
   * cannot select an amount that leaves no room for fees. Null while UTXOs or
   * fee rates are still loading.
   */
  maxDepositSats?: bigint | null;
  /**
   * Remaining application supply cap in satoshis (null = no cap or still
   * loading). Surfaced so the CTA mirrors `validateForm`'s capacity rejection
   * instead of silently no-op'ing on click.
   */
  effectiveRemaining: bigint | null;
  /** True when the supply-cap read errored — CTA must reflect this. */
  capUnavailable: boolean;
  /**
   * Exact per-HTLC PegIn (activation) tx fee in satoshis. Null while the
   * WASM query is loading. The CTA must block submission while this is
   * null so the inflated-Max display window can't be submitted.
   */
  minPeginFee: bigint | null;
  /**
   * Terminal failure from the `computeMinPeginFee` WASM query. CTA surfaces
   * this as "Fee estimate unavailable" instead of an indefinite loading
   * state. Null while the query is healthy.
   */
  minPeginFeeError: Error | null;
  btcPrice: number;
  hasPriceFetchError: boolean;
  onAmountChange: (value: string) => void;
  onMaxClick: () => void;

  applications: Application[];
  selectedApplication: string;

  providers: VaultProviderListItem[];
  isLoadingProviders: boolean;
  selectedProvider: string;
  onProviderSelect: (providerId: string) => void;

  isWalletConnected: boolean;
  estimatedFeeSats: bigint | null;
  estimatedFeeRate: number;
  isLoadingFee: boolean;
  feeError: string | null;
  depositorClaimValue?: bigint;
  isDepositDisabled: boolean;
  isGeoBlocked: boolean;
  isAddressBlocked: boolean;
  onDeposit: () => void;

  partialLiquidation?: PartialLiquidationProps;

  collateralFactor?: number | null;

  protocolFeeAmount?: string;
  protocolFeePrice?: string;
  protocolFeeIsError?: boolean;

  feeRows?: FeeRow[];

  /**
   * True while the inscription (ordinals) check is still in flight. Blocks
   * submission so the user cannot deposit before the spendable set has been
   * filtered against inscriptions.
   */
  ordinalsCheckPending?: boolean;

  /**
   * True when the click-time wallet-liveness probe (or a prior reconnect
   * attempt) failed. Promotes the CTA from "Deposit" to "Reconnect Wallet";
   * the click handler upstream branches to the reconnect flow.
   */
  hasWalletConnectionError?: boolean;

  /**
   * Detail string for the current wallet connection error. Rendered inline
   * above the CTA so the user sees the underlying cause (locked extension,
   * permission revoked, account changed) instead of just the generic
   * "Reconnect Wallet" button label.
   */
  walletConnectionErrorMessage?: string | null;

  /**
   * True while the click-time wallet liveness probe is running. Used to
   * disable the Deposit button so the user cannot double-trigger the check.
   */
  isVerifyingWallet?: boolean;

  /**
   * True while a reconnect attempt is in flight. Disables the CTA and
   * swaps its label to a progress indicator.
   */
  isReconnectingWallet?: boolean;
}

export function DepositForm({
  amount,
  amountSats,
  btcBalance,
  minDeposit,
  maxDeposit,
  maxDepositSats,
  effectiveRemaining,
  capUnavailable,
  minPeginFee,
  minPeginFeeError,
  btcPrice,
  hasPriceFetchError,
  onAmountChange,
  onMaxClick,
  applications,
  selectedApplication,
  providers,
  isLoadingProviders,
  selectedProvider,
  onProviderSelect,
  isWalletConnected,
  estimatedFeeSats,
  estimatedFeeRate,
  isLoadingFee,
  feeError,
  depositorClaimValue,
  isDepositDisabled,
  isGeoBlocked,
  isAddressBlocked,
  onDeposit,
  partialLiquidation,
  collateralFactor = null,
  protocolFeeAmount = "--",
  protocolFeePrice = "",
  protocolFeeIsError = false,
  feeRows,
  ordinalsCheckPending = false,
  hasWalletConnectionError = false,
  walletConnectionErrorMessage = null,
  isVerifyingWallet = false,
  isReconnectingWallet = false,
}: DepositFormProps) {
  const [openPanel, setOpenPanel] = useState<"split" | "provider" | null>(null);
  const setPanelExpanded =
    (panel: "split" | "provider") => (expanded: boolean) =>
      setOpenPanel(expanded ? panel : null);
  // The depositable max is unknown until the fee estimate, UTXOs, and the
  // on-chain supply cap resolve. Until then the slider is disabled (mirroring
  // the `--` Max label below) — never falling back to the raw balance, which
  // would let the user select an amount above the real cap that then strands
  // above the max once it resolves.
  const isMaxResolved = maxDepositSats != null;
  const maxDepositLabel = !isMaxResolved
    ? `-- ${btcConfig.coinSymbol}`
    : `${Number(depositService.formatSatoshisToBtc(maxDepositSats))} ${btcConfig.coinSymbol}`;

  // The slider operates in satoshis (integer values, 1-sat step) so the thumb
  // can land exactly on the max. A coarse BTC step would leave the sat-precise
  // max off the step grid, stranding the thumb short of the end. While the max
  // is loading the slider is disabled, so the `1` floor only keeps the Slider's
  // fill/step math divisor non-zero.
  const sliderMaxSats = isMaxResolved ? Number(maxDepositSats) : 1;
  const sliderValueSats = Number(amountSats);

  const usdValue = useMemo(() => {
    if (hasPriceFetchError || !btcPrice || !amount || amount === "0") return "";
    const btcNum = parseFloat(amount);
    if (isNaN(btcNum)) return "";
    return `$${(btcNum * btcPrice).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USD`;
  }, [amount, btcPrice, hasPriceFetchError]);

  const selectedApp = applications.find((a) => a.id === selectedApplication);

  const hasAmount = !!amount && amount !== "0";
  const isFeeError = hasAmount && !isLoadingFee && !!feeError;
  const feeDisabled =
    isLoadingFee ||
    estimatedFeeRate <= 0 ||
    !hasAmount ||
    !!feeError ||
    estimatedFeeSats === null;

  const splitNotReady =
    partialLiquidation?.isEnabled &&
    !partialLiquidation?.canSplit &&
    !partialLiquidation?.isLoading;

  const cta = depositService.getDepositCtaState({
    amountSats,
    minDeposit,
    maxDeposit,
    maxDepositSats: maxDepositSats ?? null,
    effectiveRemaining,
    capUnavailable,
    minPeginFee,
    minPeginFeeError,
    btcBalance,
    estimatedFeeSats: estimatedFeeSats ?? undefined,
    depositorClaimValue,
    isDepositDisabled,
    isGeoBlocked,
    isAddressBlocked,
    isWalletConnected,
    hasProvider: !!selectedProvider,
    splitNotReady: !!splitNotReady,
    isFeeError,
    feeError,
    feeDisabled,
    ordinalsCheckPending,
    hasWalletConnectionError,
    isReconnectingWallet,
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <Card variant="filled" className="flex flex-col gap-4 !rounded-lg">
        {/* Amount input with slider */}
        <AmountSlider
          amount={amount}
          currencyIcon={btcConfig.icon}
          currencyName={btcConfig.name}
          onAmountChange={(e) => onAmountChange(e.target.value)}
          sliderValue={sliderValueSats}
          sliderMin={0}
          sliderMax={sliderMaxSats}
          sliderStep={1}
          sliderSteps={[]}
          disabled={!isMaxResolved}
          onSliderChange={(sats) =>
            onAmountChange(
              depositService.formatSatoshisToBtc(BigInt(Math.round(sats))),
            )
          }
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: maxDepositLabel,
            // Mention the supply cap only when one exists for this user.
            // `effectiveRemaining` is null both when no cap applies and while
            // the cap read is loading; either way we omit the cap clause
            // until we know it's a real constraint.
            tooltip: COPY.deposit.form.maxTooltip({
              hasSupplyCap: effectiveRemaining !== null,
            }),
          }}
          rightField={{ value: usdValue }}
          onMaxClick={onMaxClick}
          inputClassName="h-10 w-auto rounded-lg bg-primary-contrast px-4 [field-sizing:content]"
        />
        <CollateralFactorRow
          collateralFactor={collateralFactor}
          amountBtc={amount}
          btcPrice={btcPrice}
          hasPriceFetchError={hasPriceFetchError}
        />
      </Card>

      {partialLiquidation && (
        <UtxoSplitSelector
          partialLiquidation={partialLiquidation}
          expanded={openPanel === "split"}
          onExpandedChange={setPanelExpanded("split")}
        />
      )}

      {/* Aave app */}
      {selectedApp && (
        <Card variant="filled" className="flex items-center gap-3 !rounded-lg">
          <ApplicationLogo
            logoUrl={selectedApp.logoUrl}
            name={selectedApp.name}
            size="small"
          />
          <span className="text-sm text-accent-primary">
            {selectedApp.name}
          </span>
        </Card>
      )}

      <VaultProviderSelector
        providers={providers}
        isLoadingProviders={isLoadingProviders}
        selectedProvider={selectedProvider}
        onProviderSelect={onProviderSelect}
        expanded={openPanel === "provider"}
        onExpandedChange={setPanelExpanded("provider")}
      />

      {/* CTA button */}
      {hasWalletConnectionError && walletConnectionErrorMessage && (
        <p className="text-sm text-error-main" role="alert">
          {walletConnectionErrorMessage}
        </p>
      )}
      <DepositButton
        variant="contained"
        color="primary"
        size="large"
        fluid
        disabled={cta.disabled || isVerifyingWallet}
        onClick={onDeposit}
      >
        {isVerifyingWallet ? "Checking wallet..." : cta.label}
      </DepositButton>

      {/* Fee breakdown */}
      <DepositFeesBreakdown
        depositorClaimValue={depositorClaimValue}
        btcPrice={btcPrice}
        hasPriceFetchError={hasPriceFetchError}
        protocolFeeAmount={protocolFeeAmount}
        protocolFeePrice={protocolFeePrice}
        protocolFeeIsError={protocolFeeIsError}
      />

      {/* Protocol & risk parameters */}
      {feeRows && feeRows.length > 0 && <FeesSection rows={feeRows} />}
    </div>
  );
}
