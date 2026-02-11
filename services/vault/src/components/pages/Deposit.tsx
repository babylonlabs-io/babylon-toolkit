import { Card, Container, Text } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { BackButton, DepositButton } from "@/components/shared";
import { FeatureFlags } from "@/config";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useBTCWallet } from "@/context/wallet";
import { depositService } from "@/services/deposit";
import { planUtxoAllocation } from "@/services/vault/utxoAllocationService";
import type { VaultConfig } from "@/types/multiVault";

import { DepositState } from "../../context/deposit/DepositState";
import { VaultRedeemState } from "../../context/deposit/VaultRedeemState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import { useUTXOs } from "../../hooks/useUTXOs";
import { DepositOverview } from "../deposit/DepositOverview";
import { MultiVaultSignModal } from "../deposit/MultiVaultSignModal";
import { VaultAllocationDebugger } from "../deposit/VaultAllocationDebugger";

import { DepositAmountSection } from "./Deposit/DepositAmountSection";
import { DepositFAQ } from "./Deposit/DepositFAQ";
import { DepositModals } from "./Deposit/DepositModals";
import { SelectApplicationSection } from "./Deposit/SelectApplicationSection";
import { SelectVaultProviderSection } from "./Deposit/SelectVaultProviderSection";

function DepositContent() {
  const navigate = useNavigate();
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();

  const handleBack = () => {
    navigate(-1);
  };

  const {
    formData,
    setFormData,
    errors,
    isValid,
    isWalletConnected,
    btcBalance,
    btcBalanceFormatted,
    btcPrice,
    priceMetadata,
    hasStalePrices,
    hasPriceFetchError,
    applications,
    isLoadingApplications,
    providers,
    isLoadingProviders,
    amountSats,
    validateForm,
    validateAmountOnBlur,
  } = useDepositPageForm();

  // Deposit flow (modals, wallet, provider data)
  const {
    depositStep,
    depositAmount,
    selectedApplication,
    selectedProviders,
    feeRate,
    btcWalletProvider,
    ethAddress,
    selectedProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    startDeposit,
    confirmReview,
    onSignSuccess,
    resetDeposit,
    refetchActivities,
  } = useDepositPageFlow();

  // Multi-vault modal state
  const [isMultiVaultModalOpen, setIsMultiVaultModalOpen] = useState(false);

  // Multi-vault amounts calculation
  const vaultAmounts = useMemo(() => {
    if (formData.numVaults === 1) return [];
    return formData.vaultAmounts.map((amt) =>
      depositService.parseBtcToSatoshis(amt || "0"),
    );
  }, [formData.numVaults, formData.vaultAmounts]);

  const handleMaxClick = () => {
    if (btcBalanceFormatted > 0) {
      setFormData({ amountBtc: btcBalanceFormatted.toString() });
    }
  };

  // Multi-vault POC: Handle vault configuration changes
  const handleNumVaultsChange = (num: number) => {
    const newVaultAmounts: string[] = [];

    if (formData.autoSplit && formData.amountBtc) {
      // Auto-split equally
      const totalBtc = parseFloat(formData.amountBtc);
      if (!isNaN(totalBtc)) {
        const perVault = totalBtc / num;
        for (let i = 0; i < num; i++) {
          newVaultAmounts.push(perVault.toFixed(8));
        }
      }
    }

    setFormData({ numVaults: num, vaultAmounts: newVaultAmounts });
  };

  const handleAutoSplitChange = (auto: boolean) => {
    if (auto && formData.amountBtc) {
      // Recalculate equal split
      const totalBtc = parseFloat(formData.amountBtc);
      if (!isNaN(totalBtc)) {
        const newVaultAmounts: string[] = [];
        const perVault = totalBtc / formData.numVaults;
        for (let i = 0; i < formData.numVaults; i++) {
          newVaultAmounts.push(perVault.toFixed(8));
        }
        setFormData({ autoSplit: auto, vaultAmounts: newVaultAmounts });
        return;
      }
    }
    setFormData({ autoSplit: auto });
  };

  const handleVaultAmountChange = (index: number, amount: string) => {
    const newVaultAmounts = [...formData.vaultAmounts];
    newVaultAmounts[index] = amount;
    setFormData({ vaultAmounts: newVaultAmounts });
  };

  const handleDeposit = () => {
    if (!validateForm()) return;

    // Route to appropriate flow based on numVaults
    if (formData.numVaults > 1) {
      // Multi-vault flow: Populate deposit context to load provider data
      // This triggers Review modal in background, but multi-vault modal appears on top
      // (POC tolerance - Review modal is briefly visible behind multi-vault modal)
      startDeposit(amountSats, formData.selectedApplication, [
        formData.selectedProvider,
      ]);

      // Open modal to start multi-vault flow
      setIsMultiVaultModalOpen(true);
      return;
    }

    // Single-vault flow (existing)
    startDeposit(amountSats, formData.selectedApplication, [
      formData.selectedProvider,
    ]);
  };

  // Multi-vault POC: Calculate allocation plan
  const { address: btcAddress } = useBTCWallet();
  const { spendableUTXOs } = useUTXOs(btcAddress);

  const vaultConfigs: VaultConfig[] = useMemo(() => {
    if (formData.numVaults === 1 || !formData.amountBtc) {
      return [];
    }

    const configs: VaultConfig[] = [];
    for (let i = 0; i < formData.numVaults; i++) {
      const amountBtc = formData.vaultAmounts[i] || "0";
      const amountSats = depositService.parseBtcToSatoshis(amountBtc);

      configs.push({
        index: i,
        amountBtc,
        amountSats,
      });
    }

    return configs;
  }, [formData.numVaults, formData.amountBtc, formData.vaultAmounts]);

  const allocationPlan = useMemo(() => {
    if (
      formData.numVaults <= 1 ||
      !spendableUTXOs ||
      vaultConfigs.length === 0 ||
      !btcAddress
    ) {
      return null;
    }

    try {
      const vaultAmounts = vaultConfigs.map((v) => v.amountSats);
      const plan = planUtxoAllocation(
        spendableUTXOs,
        vaultAmounts,
        feeRate || 10, // Default fee rate
        btcAddress,
      );
      return plan;
    } catch (error) {
      console.error("[Deposit] Failed to plan allocation:", error);
      return null;
    }
  }, [formData.numVaults, spendableUTXOs, vaultConfigs, btcAddress, feeRate]);

  return (
    <Container
      as="main"
      className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-col py-8">
        <div className="self-start">
          <BackButton label="Back" onClick={handleBack} />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            <DepositAmountSection
              amount={formData.amountBtc}
              btcBalance={btcBalance}
              btcPrice={btcPrice}
              error={errors.amount}
              completed={formData.amountBtc !== "" && !errors.amount}
              onAmountChange={(value) => setFormData({ amountBtc: value })}
              onAmountBlur={validateAmountOnBlur}
              onMaxClick={handleMaxClick}
              priceMetadata={priceMetadata}
              hasStalePrices={hasStalePrices}
              hasPriceFetchError={hasPriceFetchError}
              // Multi-vault POC props
              numVaults={formData.numVaults}
              autoSplit={formData.autoSplit}
              vaultAmounts={formData.vaultAmounts}
              onNumVaultsChange={handleNumVaultsChange}
              onAutoSplitChange={handleAutoSplitChange}
              onVaultAmountChange={handleVaultAmountChange}
            />

            <SelectApplicationSection
              applications={applications}
              isLoading={isLoadingApplications}
              selectedApplication={formData.selectedApplication}
              error={errors.application}
              completed={
                formData.selectedApplication !== "" && !errors.application
              }
              onSelect={(appId) => setFormData({ selectedApplication: appId })}
            />

            <SelectVaultProviderSection
              providers={providers}
              isLoading={isLoadingProviders}
              selectedProvider={formData.selectedProvider}
              error={errors.provider}
              completed={formData.selectedProvider !== "" && !errors.provider}
              disabled={!isWalletConnected}
              onSelect={(providerId) =>
                setFormData({ selectedProvider: providerId })
              }
            />

            {/* Multi-vault POC: Show allocation debugger */}
            {formData.numVaults > 1 &&
              spendableUTXOs &&
              vaultConfigs.length > 0 && (
                <VaultAllocationDebugger
                  availableUtxos={spendableUTXOs}
                  vaultConfigs={vaultConfigs}
                  allocationPlan={allocationPlan}
                  defaultCollapsed={false}
                />
              )}

            {!FeatureFlags.isDepositEnabled && (
              <Text variant="body2" className="text-center text-warning-main">
                Depositing is temporarily unavailable. Please check back later.
              </Text>
            )}

            <DepositButton
              variant="contained"
              color="secondary"
              size="large"
              disabled={
                !isValid ||
                !FeatureFlags.isDepositEnabled ||
                isGeoBlocked ||
                isGeoLoading
              }
              onClick={handleDeposit}
              className="w-full"
            >
              {FeatureFlags.isDepositEnabled
                ? "Deposit"
                : "Depositing Unavailable"}
            </DepositButton>
          </div>

          <DepositFAQ />
        </div>

        <Card className="mt-[72px]">
          <h2 className="mb-6 text-2xl font-normal leading-[133%] tracking-[0px] text-accent-primary">
            Deposits
          </h2>
          <DepositOverview />
        </Card>
      </div>

      <DepositModals
        depositStep={depositStep}
        depositAmount={depositAmount}
        selectedApplication={selectedApplication}
        selectedProviders={selectedProviders}
        feeRate={feeRate}
        btcWalletProvider={btcWalletProvider}
        ethAddress={ethAddress}
        selectedProviderBtcPubkey={selectedProviderBtcPubkey}
        vaultKeeperBtcPubkeys={vaultKeeperBtcPubkeys}
        universalChallengerBtcPubkeys={universalChallengerBtcPubkeys}
        onClose={resetDeposit}
        onConfirmReview={confirmReview}
        onSignSuccess={onSignSuccess}
        onRefetchActivities={refetchActivities}
      />

      {/* Multi-vault modal */}
      {isMultiVaultModalOpen && formData.numVaults > 1 && (
        <MultiVaultSignModal
          open={isMultiVaultModalOpen}
          onClose={() => {
            setIsMultiVaultModalOpen(false);
            resetDeposit(); // Close Review modal if open
          }}
          onSuccess={async () => {
            await refetchActivities();
            setIsMultiVaultModalOpen(false);
            resetDeposit(); // Close Review modal if open
          }}
          vaultAmounts={vaultAmounts}
          feeRate={feeRate || 10}
          btcWalletProvider={btcWalletProvider}
          depositorEthAddress={ethAddress}
          selectedApplication={formData.selectedApplication}
          selectedProviders={[formData.selectedProvider]}
          vaultProviderBtcPubkey={selectedProviderBtcPubkey}
          vaultKeeperBtcPubkeys={vaultKeeperBtcPubkeys}
          universalChallengerBtcPubkeys={universalChallengerBtcPubkeys}
          onRefetchActivities={refetchActivities}
        />
      )}
    </Container>
  );
}

export default function Deposit() {
  return (
    <ProtocolParamsProvider>
      <DepositState>
        <VaultRedeemState>
          <DepositContent />
        </VaultRedeemState>
      </DepositState>
    </ProtocolParamsProvider>
  );
}
