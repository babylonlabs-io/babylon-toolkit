import { Container, Button } from "@babylonlabs-io/core-ui";

import { Applications } from "../Overview/Applications";

export default function ApplicationsHome() {
  return (
    <Container
      as="main"
      className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
    >
        <div className="flex flex-col gap-4 my-[90px]">
          <h1 className="text-center text-[60px] font-light leading-[110%] tracking-[0px] text-accent-primary">
            Use your Bitcoin Accross applications
          </h1>
          <h2 className="text-center text-2xl font-normal leading-[133%] tracking-[0px] text-accent-secondary">
            Deposit your BTC, select the application, choose a vault provider and begin.
          </h2>
          <Button color="secondary" rounded className="self-center mt-4">Deposit BTC</Button>
        </div>
        <h3 className="text-2xl font-normal capitalize text-accent-primary md:mb-6">
            Applications
        </h3>
        <Applications />
    </Container>
  );
}

