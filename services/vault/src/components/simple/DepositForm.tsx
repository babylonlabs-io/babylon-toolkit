import { AmountSlider, Card } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { depositService } from "@/services/deposit";

import { CollateralFactorRow } from "./CollateralFactorRow";
import { DepositFeesBreakdown } from "./DepositFeesBreakdown";
import { FeesSection, type FeeRow } from "./FeesSection";
import { UtxoSplitSelector } from "./UtxoSplitSelector";
import { VaultProviderSelector } from "./VaultProviderSelector";

const btcConfig = getNetworkConfigBTC();

interface Provider {
  id: string;
  name: string;
  /** Provider icon URL, used by the picker to render the provider logo. */
  iconUrl?: string;
  /** When true, the provider renders disabled in the picker and is not selectable. */
  unavailable?: boolean;
  /** Tooltip text shown on hover when the provider is unavailable. */
  unavailableReason?: string;
}

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
  btcPrice: number;
  hasPriceFetchError: boolean;
  onAmountChange: (value: string) => void;
  onMaxClick: () => void;

  applications: Application[];
  selectedApplication: string;

  providers: Provider[];
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
  // Fee-adjusted depositable max in satoshis. Falls back to the raw balance
  // while the fee estimate is still loading.
  const maxDepositSatsOrBalance = maxDepositSats ?? btcBalance;
  // While the fee estimate is loading, the fallback to the raw balance would
  // briefly show more than is actually depositable. Show a placeholder instead
  // so the displayed Max never overstates the cap.
  const maxDepositLabel =
    maxDepositSats == null
      ? `-- ${btcConfig.coinSymbol}`
      : `${Number(depositService.formatSatoshisToBtc(maxDepositSats))} ${btcConfig.coinSymbol}`;

  // The slider operates in satoshis (integer values, 1-sat step) so the thumb
  // can land exactly on the max. A coarse BTC step would leave the sat-precise
  // max off the step grid, stranding the thumb short of the end.
  const sliderMaxSats = Number(maxDepositSatsOrBalance) || 1;
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
          onSliderChange={(sats) =>
            onAmountChange(
              depositService.formatSatoshisToBtc(BigInt(Math.round(sats))),
            )
          }
          sliderVariant="primary"
          leftField={{ label: "Max", value: maxDepositLabel }}
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
