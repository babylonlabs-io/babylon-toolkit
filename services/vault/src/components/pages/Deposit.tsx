import { Button, Card, Container } from "@babylonlabs-io/core-ui";

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
  // Form state and validation
  const {
    formData,
    setFormData,
    errors,
    isValid,
    btcBalance,
    btcBalanceFormatted,
    btcPrice,
    applications,
    isLoadingApplications,
    providers,
    isLoadingProviders,
    amountSats,
    validateForm,
  } = useDepositPageForm();

  // Deposit flow (modals, wallet, provider data)
  const {
    depositStep,
    depositAmount,
    selectedProviders,
    btcWalletProvider,
    ethAddress,
    selectedProviderBtcPubkey,
    liquidatorBtcPubkeys,
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
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-[80px] py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            <DepositAmountSection
              amount={formData.amountBtc}
              btcBalance={btcBalance}
              btcPrice={btcPrice}
              error={errors.amount}
              onAmountChange={(value) => setFormData({ amountBtc: value })}
              onMaxClick={handleMaxClick}
            />

            <SelectApplicationSection
              applications={applications}
              isLoading={isLoadingApplications}
              selectedApplication={formData.selectedApplication}
              error={errors.application}
              onSelect={(appId) => setFormData({ selectedApplication: appId })}
            />

            <SelectVaultProviderSection
              providers={providers}
              isLoading={isLoadingProviders}
              selectedProvider={formData.selectedProvider}
              error={errors.provider}
              onSelect={(providerId) =>
                setFormData({ selectedProvider: providerId })
              }
            />

            <Button
              variant="contained"
              color="secondary"
              size="large"
              disabled={!isValid}
              onClick={handleDeposit}
              className="w-full"
            >
              Deposit
            </Button>
          </div>

          <DepositFAQ />
        </div>

        <Card>
          <h2 className="mb-6 text-2xl font-normal leading-[133%] tracking-[0px] text-accent-primary">
            Deposits
          </h2>
          <DepositOverview />
        </Card>
      </div>

      <DepositModals
        depositStep={depositStep}
        depositAmount={depositAmount}
        selectedProviders={selectedProviders}
        btcWalletProvider={btcWalletProvider}
        ethAddress={ethAddress}
        selectedProviderBtcPubkey={selectedProviderBtcPubkey}
        liquidatorBtcPubkeys={liquidatorBtcPubkeys}
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
