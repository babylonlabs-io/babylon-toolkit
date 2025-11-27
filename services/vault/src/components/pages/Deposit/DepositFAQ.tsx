import { useState } from "react";

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

export function DepositFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleClick = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="mb-4 text-2xl font-normal leading-[133%] tracking-[0px] text-accent-primary">
        FAQs
      </h2>
      <div className="space-y-4">
        {faqData.map((faq, index) => (
          <div key={index}>
            <button
              onClick={() => handleClick(index)}
              className="w-full cursor-pointer text-left"
              aria-expanded={openIndex === index}
            >
              <h3 className="text-base font-normal leading-[150%] tracking-[0.15px] text-accent-secondary">
                {faq.question}
              </h3>
            </button>
            {openIndex === index && (
              <p className="mt-2 text-base font-normal leading-[150%] tracking-[0.15px] text-accent-secondary">
                {faq.answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
