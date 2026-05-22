import { AmountSlider, Card, Checkbox, Warning } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useBtcFeeDisplay } from "@/hooks/deposit/useBtcFeeDisplay";
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

  ethereumNetworkFeeAmount?: string;
  ethereumNetworkFeePrice?: string;
  ethereumNetworkFeeIsError?: boolean;

  feeRows?: FeeRow[];

  /**
   * True when the inscription (ordinals) check could not complete. Surfaces a
   * warning so the user knows inscription UTXOs may be included in the deposit.
   */
  ordinalsCheckUnavailable?: boolean;

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
  ethereumNetworkFeeAmount = "--",
  ethereumNetworkFeePrice = "",
  ethereumNetworkFeeIsError = false,
  feeRows,
  ordinalsCheckUnavailable = false,
  ordinalsCheckPending = false,
  hasWalletConnectionError = false,
  walletConnectionErrorMessage = null,
  isVerifyingWallet = false,
  isReconnectingWallet = false,
}: DepositFormProps) {
  const [ordinalsWarningAcknowledged, setOrdinalsWarningAcknowledged] =
    useState(false);
  const [openPanel, setOpenPanel] = useState<"split" | "provider" | null>(null);
  const setPanelExpanded =
    (panel: "split" | "provider") => (expanded: boolean) =>
      setOpenPanel(expanded ? panel : null);
  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance));
  }, [btcBalance]);

  const sliderMax = btcBalanceFormatted || 1;
  const amountNum = parseFloat(amount) || 0;

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

  const {
    btcFee,
    feeAmount,
    feePrice,
    isError: isFeeError,
  } = useBtcFeeDisplay({
    estimatedFeeSats,
    btcPrice,
    hasPriceFetchError,
    isLoadingFee,
    feeError,
    hasAmount: !!amount && amount !== "0",
  });

  const feeDisabled = isLoadingFee || estimatedFeeRate <= 0 || btcFee === null;

  const splitNotReady =
    partialLiquidation?.isEnabled &&
    !partialLiquidation?.canSplit &&
    !partialLiquidation?.isLoading;

  const cta = depositService.getDepositCtaState({
    amountSats,
    minDeposit,
    maxDeposit,
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
    ordinalsWarningUnacknowledged:
      ordinalsCheckUnavailable && !ordinalsWarningAcknowledged,
    hasWalletConnectionError,
    isReconnectingWallet,
  });

  return (
    <div className="flex w-full flex-col gap-4">
      {ordinalsCheckUnavailable && (
        <Warning className="items-start" messageClassName="flex flex-col gap-3">
          <span>
            Inscription check unavailable. We couldn&apos;t verify whether your
            UTXOs contain Ordinals/inscriptions. If you proceed, any inscription
            UTXOs may be spent as part of this deposit.
          </span>
          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox
              checked={ordinalsWarningAcknowledged}
              onChange={() => setOrdinalsWarningAcknowledged((v) => !v)}
              variant="default"
              showLabel={false}
            />
            <span>
              I understand that inscription UTXOs may be spent as part of this
              deposit.
            </span>
          </label>
        </Warning>
      )}

      <Card variant="filled" className="flex flex-col gap-4 !rounded-lg">
        {/* Amount input with slider */}
        <AmountSlider
          amount={amount}
          currencyIcon={btcConfig.icon}
          currencyName={btcConfig.name}
          onAmountChange={(e) => onAmountChange(e.target.value)}
          sliderValue={amountNum}
          sliderMin={0}
          sliderMax={sliderMax}
          sliderStep={0.001}
          sliderSteps={[]}
          onSliderChange={(value) => onAmountChange(value.toString())}
          sliderVariant="primary"
          leftField={{ label: "Max", value: `${btcBalanceFormatted} BTC` }}
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
        bitcoinNetworkFeeAmount={feeAmount}
        bitcoinNetworkFeePrice={feePrice}
        bitcoinNetworkFeeIsError={isFeeError}
        ethereumNetworkFeeAmount={ethereumNetworkFeeAmount}
        ethereumNetworkFeePrice={ethereumNetworkFeePrice}
        ethereumNetworkFeeIsError={ethereumNetworkFeeIsError}
        protocolFeeAmount={protocolFeeAmount}
        protocolFeePrice={protocolFeePrice}
        protocolFeeIsError={protocolFeeIsError}
      />

      {/* Protocol & risk parameters */}
      {feeRows && feeRows.length > 0 && <FeesSection rows={feeRows} />}
    </div>
  );
}
