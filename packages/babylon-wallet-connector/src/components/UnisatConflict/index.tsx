import { Button, FullScreenDialog, Heading, Text } from "@babylonlabs-io/core-ui";

import unisatLogo from "@/core/wallets/btc/unisat/logo.svg";

const TITLE = "Couldn't connect to Unisat";
const SUBTITLE = "Some wallet extensions use the same browser connection and can block Unisat from working properly.";
const STEPS_HEADING = "You can try the following:";
const FUNDS_SAFE_TITLE = "Your funds are safe";
const FUNDS_SAFE_DESCRIPTION = "This is only a connection issue. Your funds and data are secure and not affected.";
const CLOSE_LABEL = "Close";
const REFRESH_LABEL = "Refresh page";

const RECOVERY_STEPS: ReadonlyArray<{ title: string; description?: string }> = [
  { title: "Disable other BTC wallet extension" },
  { title: "Refresh the page", description: "This will reload the connection." },
  { title: "Try connecting Unisat again", description: "Unisat should now be available." },
];

const LockIcon = (
  <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M11.6667 5.83333H10.8333V4.16667C10.8333 1.86667 8.96667 0 6.66667 0C4.36667 0 2.5 1.86667 2.5 4.16667V5.83333H1.66667C0.75 5.83333 0 6.58333 0 7.5V15.8333C0 16.75 0.75 17.5 1.66667 17.5H11.6667C12.5833 17.5 13.3333 16.75 13.3333 15.8333V7.5C13.3333 6.58333 12.5833 5.83333 11.6667 5.83333ZM6.66667 13.3333C5.75 13.3333 5 12.5833 5 11.6667C5 10.75 5.75 10 6.66667 10C7.58333 10 8.33333 10.75 8.33333 11.6667C8.33333 12.5833 7.58333 13.3333 6.66667 13.3333ZM9.25 5.83333H4.08333V4.16667C4.08333 2.74167 5.24167 1.58333 6.66667 1.58333C8.09167 1.58333 9.25 2.74167 9.25 4.16667V5.83333Z"
      fill="white"
    />
  </svg>
);

export interface UnisatConflictProps {
  open: boolean;
  onClose?: () => void;
}

export function UnisatConflict({ open, onClose }: UnisatConflictProps) {
  // A full page reload re-runs every extension's injection, giving UniSat a
  // fresh chance to claim `window.unisat` (or expose `window.unisat_wallet`)
  // once the conflicting extension is disabled.
  const onRefresh = () => window.location.reload();

  return (
    <FullScreenDialog open={open} onClose={onClose} className="items-center justify-center p-6">
      <div className="mx-auto flex w-full max-w-[440px] flex-col">
        <div className="flex flex-col items-center text-center">
          <img src={unisatLogo} alt="Unisat" className="mb-6 size-16 rounded-full" />

          <Heading variant="h4" className="mb-2 text-accent-primary">
            {TITLE}
          </Heading>

          <Text className="text-accent-secondary">{SUBTITLE}</Text>
        </div>

        <div className="mt-6 rounded border border-secondary-strokeLight p-4">
          <Text variant="body2" className="mb-4 text-accent-secondary">
            {STEPS_HEADING}
          </Text>

          <div className="flex flex-col gap-4">
            {RECOVERY_STEPS.map((step) => (
              <div key={step.title}>
                <Text className="text-accent-primary">{step.title}</Text>
                {step.description && (
                  <Text variant="body2" className="text-accent-secondary">
                    {step.description}
                  </Text>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 rounded border border-secondary-strokeLight p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded bg-success-dark">{LockIcon}</span>

          <div>
            <Text className="text-accent-primary">{FUNDS_SAFE_TITLE}</Text>
            <Text variant="body2" className="text-accent-secondary">
              {FUNDS_SAFE_DESCRIPTION}
            </Text>
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <Button variant="outlined" fluid onClick={onClose}>
            {CLOSE_LABEL}
          </Button>

          <Button fluid onClick={onRefresh} data-testid="unisat-conflict-refresh-button">
            {REFRESH_LABEL}
          </Button>
        </div>
      </div>
    </FullScreenDialog>
  );
}
