import { AmountSlider, Card, Hint, InfoIcon } from "@babylonlabs-io/core-ui";
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

export interface DepositAmountState {
  amount: string;
  amountSats: bigint;
  btcBalance: bigint;
  /** Total value of unconfirmed (in-mempool) UTXOs in satoshis. Display-only. */
  unconfirmedBalance: bigint;
  /**
   * True when the confirmed balance is zero but unconfirmed funds exist. Shows
   * an inline "pending confirmation" notice so the user understands why the
   * form reads zero while their wallet shows a balance.
   */
  hasUnconfirmedBalanceOnly: boolean;
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
}

export interface DepositFeeState {
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
  estimatedFeeSats: bigint | null;
  estimatedFeeRate: number;
  isLoadingFee: boolean;
  feeError: string | null;
  depositorClaimValue?: bigint;
  /**
   * Full HTLC output values the protocol charges commission on, one per vault.
   * Used by the fee breakdown so split deposits floor commission per HTLC.
   * `undefined` while the per-vault reserve / PegIn fee is still loading.
   */
  commissionHtlcValues?: readonly bigint[];
  /**
   * Terminal failure from the `computeMinClaimValue` WASM query. CTA surfaces
   * this as "Fee estimate unavailable" instead of an indefinite loading
   * state. Null while the query is healthy.
   */
  depositorClaimValueError: Error | null;
  protocolFeeAmount?: string;
  protocolFeePrice?: string;
  protocolFeeIsError?: boolean;
  feeRows?: FeeRow[];
}

export interface DepositProviderState {
  applications: Application[];
  selectedApplication: string;
  providers: VaultProviderListItem[];
  isLoadingProviders: boolean;
  selectedProvider: string;
  onProviderSelect: (providerId: string) => void;
}

export interface DepositWalletState {
  isWalletConnected: boolean;
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

export interface DepositGatingState {
  isDepositDisabled: boolean;
  isGeoBlocked: boolean;
  isAddressBlocked: boolean;
  /** True when this position already holds the maximum number of BTC Vaults. */
  vaultCountAtCap?: boolean;
  /**
   * True while the inscription (ordinals) check is still in flight. Blocks
   * submission so the user cannot deposit before the spendable set has been
   * filtered against inscriptions.
   */
  ordinalsCheckPending?: boolean;
}

interface DepositFormProps {
  amountState: DepositAmountState;
  feeState: DepositFeeState;
  providerState: DepositProviderState;
  walletState: DepositWalletState;
  gatingState: DepositGatingState;
  collateralFactor?: number | null;
  partialLiquidation?: PartialLiquidationProps;
  onAmountChange: (value: string) => void;
  onMaxClick: () => void;
  onDeposit: () => void;
}

export function DepositForm({
  amountState,
  feeState,
  providerState,
  walletState,
  gatingState,
  collateralFactor = null,
  partialLiquidation,
  onAmountChange,
  onMaxClick,
  onDeposit,
}: DepositFormProps) {
  const {
    amount,
    amountSats,
    btcBalance,
    unconfirmedBalance,
    hasUnconfirmedBalanceOnly,
    minDeposit,
    maxDeposit,
    maxDepositSats,
    effectiveRemaining,
    capUnavailable,
  } = amountState;
  const {
    minPeginFee,
    minPeginFeeError,
    btcPrice,
    hasPriceFetchError,
    estimatedFeeSats,
    estimatedFeeRate,
    isLoadingFee,
    feeError,
    depositorClaimValue,
    commissionHtlcValues,
    depositorClaimValueError,
    protocolFeeAmount = "--",
    protocolFeePrice = "",
    protocolFeeIsError = false,
    feeRows,
  } = feeState;
  const {
    applications,
    selectedApplication,
    providers,
    isLoadingProviders,
    selectedProvider,
    onProviderSelect,
  } = providerState;
  const {
    isWalletConnected,
    hasWalletConnectionError = false,
    walletConnectionErrorMessage = null,
    isVerifyingWallet = false,
    isReconnectingWallet = false,
  } = walletState;
  const {
    isDepositDisabled,
    isGeoBlocked,
    isAddressBlocked,
    vaultCountAtCap = false,
    ordinalsCheckPending = false,
  } = gatingState;
  const [openPanel, setOpenPanel] = useState<"split" | "provider" | null>(null);
  const setPanelExpanded =
    (panel: "split" | "provider") => (expanded: boolean) =>
      setOpenPanel(expanded ? panel : null);
  // The depositable max is unknown until the fee estimate, UTXOs, and the
  // on-chain supply cap resolve. Until then we never fall back to the raw
  // balance, which would let the user select an amount above the real cap that
  // then strands above the max once it resolves.
  const isMaxResolved = maxDepositSats != null;
  const maxDepositLabel = !isMaxResolved
    ? `-- ${btcConfig.coinSymbol}`
    : `${Number(depositService.formatSatoshisToBtc(maxDepositSats))} ${btcConfig.coinSymbol}`;

  // The slider (not the amount input or Max button) only has a meaningful drag
  // range when the resolved max is strictly above the minimum. At or below it —
  // still loading, cap-reached at 0, balance below the minimum, or exactly at
  // the minimum (a zero-width range) — there's nothing to drag, so disable the
  // slider. Manual entry and the Max button stay available; any amount above
  // the max is clamped down once it resolves.
  const hasDraggableRange =
    maxDepositSats != null && maxDepositSats > minDeposit;
  const sliderDisabled = !hasDraggableRange;

  // The slider operates in satoshis (integer values, 1-sat step) so the thumb
  // can land exactly on the max. With a draggable range, start the slider at
  // the protocol minimum so dragging can never produce a sub-minimum amount;
  // otherwise fall back to 0 so the range stays well-defined while the slider
  // is disabled. Manual text entry below the minimum stays available and is
  // still caught by validation.
  const sliderMinSats = hasDraggableRange ? Number(minDeposit) : 0;
  // Because the range is only enabled when maxDepositSats > minDeposit (and
  // sats are integers), the rendered max equals the real max — no synthetic
  // over-shoot. The `+ 1` floor is purely a `(value - min) / (max - min)`
  // divide-by-zero guard for the disabled (min = 0) states, where the slider
  // isn't interactive anyway.
  const sliderMaxSats = Math.max(
    sliderMinSats + 1,
    Number(maxDepositSats ?? 0n),
  );
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

  // When the confirmed balance reads zero but unconfirmed funds exist, show a
  // "pending confirmation" note in the slider's right slot (where the USD value
  // would sit — empty at a zero balance). The InfoIcon is wrapped with an
  // attach-to-children Hint so the markup stays inline-valid inside the slider's
  // right cell (a bare Hint would nest a div inside a span).
  const pendingConfirmationField = hasUnconfirmedBalanceOnly ? (
    <span className="inline-flex items-center gap-1 text-accent-secondary">
      {COPY.deposit.form.pendingConfirmationNotice(
        `${Number(depositService.formatSatoshisToBtc(unconfirmedBalance))} ${btcConfig.coinSymbol}`,
      )}
      <Hint
        tooltip={COPY.deposit.form.pendingConfirmationTooltip}
        attachToChildren
      >
        <InfoIcon size={16} className="text-secondary-strokeDark" />
      </Hint>
    </span>
  ) : null;

  const selectedApp = applications.find((a) => a.id === selectedApplication);

  // Commission (bps) shown for the selected provider. Drives the fee breakdown
  // and gates the CTA: a selected provider whose commission hasn't loaded
  // cannot be quoted, so the deposit must wait for it.
  const selectedProviderCommissionBps = providers.find(
    (provider) => provider.id === selectedProvider,
  )?.commissionBps;
  const commissionUnavailable =
    !!selectedProvider && selectedProviderCommissionBps === undefined;

  const hasAmount = !!amount && amount !== "0";
  const isFeeError = hasAmount && !isLoadingFee && !!feeError;
  const feeDisabled =
    isLoadingFee ||
    estimatedFeeRate <= 0 ||
    !hasAmount ||
    !!feeError ||
    estimatedFeeSats === null;

  const cta = depositService.getDepositCtaState({
    amountSats,
    minDeposit,
    maxDeposit,
    maxDepositSats: maxDepositSats ?? null,
    effectiveRemaining,
    capUnavailable,
    minPeginFee,
    minPeginFeeError,
    depositorClaimValueError,
    btcBalance,
    estimatedFeeSats: estimatedFeeSats ?? undefined,
    depositorClaimValue,
    isDepositDisabled,
    isGeoBlocked,
    isAddressBlocked,
    vaultCountAtCap,
    isWalletConnected,
    hasProvider: !!selectedProvider,
    commissionUnavailable,
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
          sliderMin={sliderMinSats}
          sliderMax={sliderMaxSats}
          sliderStep={1}
          sliderSteps={[]}
          sliderDisabled={sliderDisabled}
          onSliderChange={(sats) =>
            onAmountChange(
              depositService.formatSatoshisToBtc(BigInt(Math.round(sats))),
            )
          }
          sliderVariant="primary"
          leftField={{
            label: COPY.deposit.form.maxLabel,
            value: maxDepositLabel,
            // Mention the supply cap only when one exists for this user.
            // `effectiveRemaining` is null both when no cap applies and while
            // the cap read is loading; either way we omit the cap clause
            // until we know it's a real constraint.
            //
            // Drop the Max tooltip while the pending-confirmation note is shown
            // so the row carries a single info icon (the pending one) rather
            // than two competing tooltips.
            tooltip: hasUnconfirmedBalanceOnly
              ? undefined
              : COPY.deposit.form.maxTooltip({
                  hasSupplyCap: effectiveRemaining !== null,
                }),
          }}
          rightField={{
            value: !hasAmount
              ? (pendingConfirmationField ?? COPY.common.zeroUsdValue)
              : usdValue,
          }}
          maxPosition="left"
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
        amountSats={amountSats}
        commissionBps={selectedProviderCommissionBps}
        commissionHtlcValues={commissionHtlcValues}
      />

      {/* Protocol & risk parameters */}
      {feeRows && feeRows.length > 0 && <FeesSection rows={feeRows} />}
    </div>
  );
}
