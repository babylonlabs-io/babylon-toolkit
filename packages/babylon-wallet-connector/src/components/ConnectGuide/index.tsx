import { Button, DialogBody, DialogFooter, Heading, Text, WalletIcon } from "@babylonlabs-io/core-ui";

import type { ConnectGuide as ConnectGuideContent } from "@/core/types";

interface ConnectGuideProps {
  name: string;
  logo: string;
  // See `IWallet.iconBackground`.
  logoBackground?: string;
  guide: ConnectGuideContent;
  onConnect?: () => void;
}

export function ConnectGuide({ name, logo, logoBackground, guide, onConnect }: ConnectGuideProps) {
  return (
    <div>
      <DialogBody className="flex flex-col gap-6 py-10">
        <div className="flex items-center gap-3">
          <WalletIcon className="shrink-0" alt={name} url={logo} background={logoBackground} />
          <Heading variant="h5" className="text-accent-primary">
            Before you connect
          </Heading>
        </div>

        <ol className="flex list-decimal flex-col gap-2 pl-5 text-accent-primary">
          {guide.steps.map((step) => (
            <Text as="li" variant="body2" key={step}>
              {step}
            </Text>
          ))}
        </ol>

        {guide.installSteps && (
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-100 p-4">
            <Text variant="body2" className="text-accent-primary">
              Don't have the app yet?
            </Text>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-accent-secondary">
              {guide.installSteps.map((step) => (
                <Text as="li" variant="body2" key={step}>
                  {step}
                </Text>
              ))}
            </ol>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button fluid onClick={onConnect} data-testid="connect-guide-connect-button">
          Connect
        </Button>
      </DialogFooter>
    </div>
  );
}
