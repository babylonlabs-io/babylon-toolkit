import { Container } from "@babylonlabs-io/core-ui";

import { Applications } from "../Overview/Applications";

export default function ApplicationsHome() {
  return (
    <Container
      as="main"
      className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
    >
        <h3 className="text-2xl font-normal capitalize text-accent-primary md:mb-6">
            Applications
        </h3>
        <Applications />
    </Container>
  );
}

