import { Button, Container } from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { Applications } from "../Applications";
import { Connect } from "../Wallet";

export default function ApplicationsHome() {
  const navigate = useNavigate();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();

  const isWalletConnected = btcConnected && ethConnected;

  return (
    <Container
      as="main"
      className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
    >
      <div className="my-[90px] flex flex-col gap-4">
        <h1 className="text-center text-[60px] font-light leading-[110%] tracking-[0px] text-accent-primary">
          Use your Bitcoin across applications
        </h1>
        <h2 className="text-center text-2xl font-normal leading-[133%] tracking-[0px] text-accent-secondary">
          Deposit your BTC, select the application, choose a vault provider and
          begin.
        </h2>
        <div className="mt-4 self-center">
          {isWalletConnected ? (
            <Button
              color="secondary"
              rounded
              onClick={() => navigate("/deposit")}
            >
              Deposit BTC
            </Button>
          ) : (
            <Connect />
          )}
        </div>
      </div>
      <Applications />
    </Container>
  );
}
