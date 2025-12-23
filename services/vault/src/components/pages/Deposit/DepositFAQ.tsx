import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Heading,
  Text,
} from "@babylonlabs-io/core-ui";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";

const faqData = [
  {
    id: "how-to-deposit",
    question: "How do I make a deposit?",
    answer:
      "To make a deposit, select your preferred vault provider and application, enter the amount you wish to deposit, and follow the on-screen instructions. You will need a supported wallet to complete the transaction.",
  },
  {
    id: "min-max-amount",
    question: "What is the minimum and maximum deposit amount?",
    answer:
      "The minimum and maximum deposit amounts depend on the selected vault provider and application. Please refer to the deposit form for specific limits.",
  },
  {
    id: "processing-time",
    question: "How long does it take for my deposit to be processed?",
    answer:
      "Deposits are typically processed within a few minutes, but processing times may vary depending on network congestion and provider policies.",
  },
  {
    id: "fees",
    question: "Are there any fees for making a deposit?",
    answer:
      "Some vault providers may charge a small fee for processing deposits. Any applicable fees will be displayed before you confirm your transaction.",
  },
  {
    id: "security",
    question: "Is my deposit secure?",
    answer:
      "All deposits are secured using industry-standard encryption and security protocols. Please ensure you are using a trusted wallet and provider.",
  },
];

export function DepositFAQ() {
  return (
    <section>
      <Heading
        as="h3"
        variant="h5"
        className="mb-4 font-normal capitalize text-accent-primary md:mb-6 md:text-[1.625rem] md:leading-[2.625rem] md:tracking-[0.25px]"
      >
        FAQs
      </Heading>
      <div className="divide-y divide-secondary-strokeLight">
        {faqData.map((faq) => (
          <div key={faq.id} className="pb-6 pt-4 first:pt-0">
            <Accordion className="text-primary-dark">
              <AccordionSummary
                renderIcon={(expanded) =>
                  expanded ? (
                    <AiOutlineMinus size={24} />
                  ) : (
                    <AiOutlinePlus size={24} />
                  )
                }
              >
                <Heading variant="h6" className="mr-4">
                  <span className="align-middle">{faq.question}</span>
                </Heading>
              </AccordionSummary>
              <AccordionDetails className="pt-2" unmountOnExit>
                <Text as="div">{faq.answer}</Text>
              </AccordionDetails>
            </Accordion>
          </div>
        ))}
      </div>
    </section>
  );
}
