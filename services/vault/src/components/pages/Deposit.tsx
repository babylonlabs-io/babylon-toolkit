import { Button, Container } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import { depositService } from "../../services/deposit";

import { DepositAmountSection } from "./Deposit/DepositAmountSection";
import { SelectApplicationSection } from "./Deposit/SelectApplicationSection";
import { SelectVaultProviderSection } from "./Deposit/SelectVaultProviderSection";

export default function Deposit() {
  const {
    formData,
    setFormData,
    errors,
    isValid,
    btcBalance,
    btcPrice,
    applications,
    isLoadingApplications,
    providers,
    isLoadingProviders,
    validateForm,
  } = useDepositPageForm();

  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance, 8));
  }, [btcBalance]);

  const handleMaxClick = () => {
    if (btcBalanceFormatted > 0) {
      setFormData({ amountBtc: btcBalanceFormatted.toString() });
    }
  };

  const handleDeposit = () => {
    if (validateForm()) {
      console.log("Deposit validated:", {
        amount: formData.amountBtc,
        application: formData.selectedApplication,
        provider: formData.selectedProvider,
      });
    }
  };

  return (
    <Container
      as="main"
      className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
    >
      <div className="mx-auto w-full max-w-[1400px] py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
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
              color="primary"
              size="large"
              disabled={!isValid}
              onClick={handleDeposit}
              className="mt-4 w-full"
            >
              Deposit
            </Button>
          </div>

          <div className="flex flex-col gap-6">
            <h2 className="mb-4 text-xl font-semibold text-accent-primary">
              FAQs
            </h2>
            <div className="text-base-foreground space-y-4">
              <div>
                <h3 className="mb-2 font-semibold">
                  Lorem ipsum dolor sit amet?
                </h3>
                <p className="text-sm">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Ut enim ad minim veniam?</h3>
                <p className="text-sm">
                  Ut enim ad minim veniam, quis nostrud exercitation ullamco
                  laboris nisi ut aliquip ex ea commodo consequat.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">
                  Duis aute irure dolor in reprehenderit?
                </h3>
                <p className="text-sm">
                  Duis aute irure dolor in reprehenderit in voluptate velit esse
                  cillum dolore eu fugiat nulla pariatur.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">
                  Excepteur sint occaecat cupidatat?
                </h3>
                <p className="text-sm">
                  Excepteur sint occaecat cupidatat non proident, sunt in culpa
                  qui officia deserunt mollit anim id est laborum.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
