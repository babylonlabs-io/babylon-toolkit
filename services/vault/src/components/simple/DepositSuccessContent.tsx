import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface DepositSuccessContentProps {
  onClose: () => void;
}

export function DepositSuccessContent({ onClose }: DepositSuccessContentProps) {
  return (
    <div className="w-full max-w-[520px] text-center">
      <img
        src={btcConfig.icon}
        alt={btcConfig.name}
        className="mx-auto h-auto w-full max-w-[160px]"
      />

      <Heading
        variant="h4"
        className="mb-4 mt-6 text-xl text-accent-primary sm:text-2xl"
      >
        Deposit Request Submitted
      </Heading>

      <Text
        variant="body1"
        className="text-sm text-accent-secondary sm:text-base"
      >
        Your deposit request has been sent. Vault Providers are preparing
        transactions to secure your {btcConfig.coinSymbol}, and you&apos;ll be
        asked to sign additional Bitcoin transactions once they&apos;re ready.
      </Text>

      <Button
        variant="contained"
        color="primary"
        className="mt-8 w-full"
        onClick={onClose}
      >
        Done
      </Button>
    </div>
  );
}
