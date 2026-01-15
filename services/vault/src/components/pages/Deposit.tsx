import { Button, Card, Container, Text } from "@babylonlabs-io/core-ui";
import { useNavigate, useSearchParams } from "react-router";

import { BackButton } from "@/components/shared";
import { FeatureFlags } from "@/config";

import { DepositState } from "../../context/deposit/DepositState";
import { VaultRedeemState } from "../../context/deposit/VaultRedeemState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import { DepositOverview } from "../deposit/DepositOverview";

import { DepositAmountSection } from "./Deposit/DepositAmountSection";
import { DepositFAQ } from "./Deposit/DepositFAQ";
import { DepositModals } from "./Deposit/DepositModals";
import { SelectApplicationSection } from "./Deposit/SelectApplicationSection";
import { SelectVaultProviderSection } from "./Deposit/SelectVaultProviderSection";

function DepositContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialAppId = searchParams.get("app") || undefined;

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
    applications,
    isLoadingApplications,
    providers,
    isLoadingProviders,
    amountSats,
    validateForm,
  } = useDepositPageForm({ initialApplicationId: initialAppId });

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

  const handleMaxClick = () => {
    if (btcBalanceFormatted > 0) {
      setFormData({ amountBtc: btcBalanceFormatted.toString() });
    }
  };

  const handleDeposit = () => {
    if (validateForm()) {
      startDeposit(amountSats, formData.selectedApplication, [
        formData.selectedProvider,
      ]);
    }
  };

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
              onMaxClick={handleMaxClick}
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

            {!FeatureFlags.isDepositEnabled && (
              <Text
                variant="body2"
                className="text-center text-warning-main"
              >
                Depositing is temporarily unavailable. Please check back later.
              </Text>
            )}

            <Button
              variant="contained"
              color="secondary"
              size="large"
              disabled={!isValid || !FeatureFlags.isDepositEnabled}
              onClick={handleDeposit}
              className="w-full"
            >
              {FeatureFlags.isDepositEnabled ? "Deposit" : "Depositing Unavailable"}
            </Button>
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
    </Container>
  );
}

export default function Deposit() {
  return (
    <DepositState>
      <VaultRedeemState>
        <DepositContent />
      </VaultRedeemState>
    </DepositState>
  );
}
