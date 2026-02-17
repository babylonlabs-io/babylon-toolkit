import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface SplitVaultsContentProps {
  onContinueSplit: () => void;
  onDoNotSplit: () => void;
}

export function SplitVaultsContent({
  onContinueSplit,
  onDoNotSplit,
}: SplitVaultsContentProps) {
  return (
    <div className="w-full max-w-[520px]">
      <div className="rounded-3xl border border-secondary-strokeLight px-6 pb-6 pt-10">
        <div className="flex flex-col items-center text-center">
          <img
            src={btcConfig.icon}
            alt={btcConfig.name}
            className="h-[100px] w-[100px]"
          />

          <Heading variant="h5" className="mt-6 text-accent-primary">
            Split your Bitcoin into multiple vaults
          </Heading>

          <Text variant="body1" className="mt-4 text-accent-secondary">
            Splitting your BTC into multiple vaults allows your collateral to be
            liquidated only partially instead of fully, when possible.
          </Text>
        </div>

        <div className="mt-10 flex flex-col gap-3">
          <Button
            variant="contained"
            color="secondary"
            fluid
            onClick={onContinueSplit}
          >
            Continue to Split 40%:60% (Recommended)
          </Button>

          <Button variant="ghost" color="primary" fluid onClick={onDoNotSplit}>
            Do not split
          </Button>
        </div>
      </div>
    </div>
  );
}
