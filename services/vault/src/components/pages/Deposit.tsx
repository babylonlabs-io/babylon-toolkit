import { Button, Container } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import { depositService } from "../../services/deposit";

import { DepositAmountSection } from "./Deposit/DepositAmountSection";
import { SelectApplicationSection } from "./Deposit/SelectApplicationSection";
import { SelectVaultProviderSection } from "./Deposit/SelectVaultProviderSection";

const faqData = [
  {
    question: "Lorem ipsum dolor sit amet?",
    answer:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  },
  {
    question: "Ut enim ad minim veniam?",
    answer:
      "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  },
  {
    question: "Duis aute irure dolor in reprehenderit?",
    answer:
      "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  },
  {
    question: "Excepteur sint occaecat cupidatat?",
    answer:
      "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  },
];

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

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

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

  const handleFaqClick = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <Container
      as="main"
      className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
    >
      <div className="mx-auto w-full max-w-[1400px] py-8">
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

          <div className="flex flex-col gap-6">
            <h2 className="mb-4 text-2xl font-normal leading-[133%] tracking-[0px] text-accent-primary">
              FAQs
            </h2>
            <div className="space-y-4">
              {faqData.map((faq, index) => (
                <div key={index}>
                  <button
                    onClick={() => handleFaqClick(index)}
                    className="w-full cursor-pointer text-left"
                  >
                    <h3 className="text-base font-normal leading-[150%] tracking-[0.15px] text-accent-secondary">
                      {faq.question}
                    </h3>
                  </button>
                  {openFaqIndex === index && (
                    <p className="mt-2 text-base font-normal leading-[150%] tracking-[0.15px] text-accent-secondary">
                      {faq.answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
