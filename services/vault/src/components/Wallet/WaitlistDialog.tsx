import {
  Avatar,
  Button,
  Heading,
  ResponsiveDialog,
  Text,
  WalletIcon,
} from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { useWaitlist } from "@/hooks/useWaitlist";

export function WaitlistDialog({ depositOpen }: { depositOpen: boolean }) {
  const {
    show,
    address,
    chainIcon,
    wallet,
    fallbackIcon,
    formUrl,
    emailUrl,
    dismiss,
    switchWallet,
  } = useWaitlist(depositOpen);

  return (
    <ResponsiveDialog
      open={show}
      onClose={dismiss}
      aria-modal="true"
      aria-labelledby="waitlist-title"
      className="w-[612px]"
      dialogClassName="max-h-[calc(100svh-2rem)] overflow-y-auto dark:!bg-primary-main md:!rounded-2xl md:!pt-8"
    >
      <div className="flex flex-col gap-6 text-accent-primary">
        <div className="flex flex-col gap-1">
          <Heading id="waitlist-title" variant="h5">
            {COPY.wallet.waitlist.title}
          </Heading>
          <Text className="text-accent-secondary">
            {COPY.wallet.waitlist.beforeLaunch}
            <span className="text-accent-primary">
              {COPY.wallet.waitlist.launch}
            </span>
            {COPY.wallet.waitlist.afterLaunch}
          </Text>
        </div>
        <div className="flex flex-col gap-2.5 rounded-lg bg-background-contrast p-4">
          <div className="flex flex-col gap-4">
            <button
              type="button"
              className="flex w-full items-center gap-2.5 text-left"
              onClick={switchWallet}
            >
              <Avatar url={chainIcon} alt="" size="large" />
              <Text as="span" className="flex-1">
                {COPY.wallet.waitlist.switchWallet}
              </Text>
              <img
                src="/images/waitlist-chevron.svg"
                width={24}
                height={24}
                alt=""
              />
            </button>
            <div className="flex min-h-12 items-center gap-2.5 rounded-lg bg-error-light/10 p-2">
              <WalletIcon
                url={wallet?.icon ?? fallbackIcon ?? ""}
                fallbackUrl={fallbackIcon}
                alt={wallet?.name}
                background={wallet?.iconBackground}
                size="medium"
                className="shrink-0"
              />
              <Text
                variant="caption"
                className="min-w-0 break-all text-error-dark"
              >
                {address}
              </Text>
            </div>
          </div>
          <Text variant="body2" className="text-accent-secondary">
            {COPY.wallet.waitlist.description}
          </Text>
        </div>
        <div className="flex flex-col gap-3">
          {formUrl ? (
            <a
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bbn-btn bbn-btn-contained bbn-btn-secondary bbn-btn-large bbn-btn-fluid flex items-center justify-center !rounded-lg !text-sm !tracking-[0.17px]"
            >
              {COPY.wallet.waitlist.openForm}
            </a>
          ) : (
            <Button
              color="secondary"
              fluid
              disabled
              className="!rounded-lg !text-sm !tracking-[0.17px]"
            >
              {COPY.wallet.waitlist.openForm}
            </Button>
          )}
          {emailUrl && (
            <a
              href={emailUrl}
              className="text-center text-sm text-accent-primary underline"
            >
              {COPY.wallet.waitlist.email}
            </a>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
