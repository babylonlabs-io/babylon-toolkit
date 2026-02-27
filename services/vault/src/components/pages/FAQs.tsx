import { Container } from "@babylonlabs-io/core-ui";

import { DepositFAQ } from "./Deposit/DepositFAQ";

export default function FAQs() {
  return (
    <Container as="main" className="pb-6">
      <DepositFAQ />
    </Container>
  );
}
