import { Button, Card, Container } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import { DepositOverview } from "../Overview/Deposits/DepositOverview";
import { DepositState } from "../Overview/Deposits/state/DepositState";
import { VaultRedeemState } from "../Overview/Deposits/state/VaultRedeemState";

import { DepositAmountSection } from "./Deposit/DepositAmountSection";
import { SelectApplicationSection } from "./Deposit/SelectApplicationSection";
import { SelectVaultProviderSection } from "./Deposit/SelectVaultProviderSection";

const faqData = [
  {
    question: "How do I make a deposit?",
    answer:
      "To make a deposit, select your preferred vault provider and application, enter the amount you wish to deposit, and follow the on-screen instructions. You will need a supported wallet to complete the transaction.",
  },
  {
    question: "What is the minimum and maximum deposit amount?",
    answer:
      "The minimum and maximum deposit amounts depend on the selected vault provider and application. Please refer to the deposit form for specific limits.",
  },
  {
    question: "How long does it take for my deposit to be processed?",
    answer:
      "Deposits are typically processed within a few minutes, but processing times may vary depending on network congestion and provider policies.",
  },
  {
    question: "Are there any fees for making a deposit?",
    answer:
      "Some vault providers may charge a small fee for processing deposits. Any applicable fees will be displayed before you confirm your transaction.",
  },
  {
    question: "Is my deposit secure?",
    answer:
      "All deposits are secured using industry-standard encryption and security protocols. Please ensure you are using a trusted wallet and provider.",
  },
];

function DepositContent() {
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
    validateForm,
  } = useDepositPageForm();

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

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
                    aria-expanded={openFaqIndex === index}
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

        <Card>
          <h2 className="mb-6 text-2xl font-normal leading-[133%] tracking-[0px] text-accent-primary">
            Deposits
          </h2>
          <DepositOverview />
        </Card>
      </div>
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
