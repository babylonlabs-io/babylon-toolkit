import { Heading, Text } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

const REDEMPTION_STEPS = [
  "Sign the redemption transaction in your Ethereum wallet",
  "The vault provider processes your redemption request",
  `Your ${btcConfig.coinSymbol} is sent back to your wallet`,
] as const;

/**
 * Displays the redemption process steps and timeline information.
 * Used in the redemption review modal to set user expectations.
 */
export function RedemptionProcessInfo() {
  return (
    <>
      {/* Redemption Process Steps */}
      <div className="rounded-lg bg-secondary-highlight p-4">
        <Heading variant="h6" className="mb-3 text-accent-primary">
          What happens next?
        </Heading>

        <div className="flex flex-col gap-3">
          {REDEMPTION_STEPS.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-main text-xs font-medium text-primary-contrast">
                {index + 1}
              </div>
              <Text variant="body2" className="text-accent-secondary">
                {step}
              </Text>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline Notice */}
      <div className="bg-warning-contrast flex items-start gap-2 rounded-lg p-3">
        <span className="text-warning-main">&#9432;</span>
        <Text variant="body2" className="text-accent-secondary">
          This process typically takes <strong>up to 3 days</strong> to
          complete. Your vault will show as &quot;Redeem in Progress&quot; until
          your {btcConfig.coinSymbol} is returned.
        </Text>
      </div>
    </>
  );
}
