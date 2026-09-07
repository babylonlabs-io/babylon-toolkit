import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

/**
 * Terminal state for a reserve that turned out to be already spent — usually
 * the same depositor sweeping from another device. Their money is where they
 * wanted it, so this reads as a resolved outcome rather than a failure.
 */
export function ReclaimAlreadySettledContent({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[564px] flex-col gap-10 rounded-3xl border border-secondary-strokeLight bg-surface px-6 pb-6 pt-10 dark:border-secondary-strokeDark">
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <Heading variant="h5" className="text-accent-primary">
          {COPY.reclaim.alreadySettled.heading}
        </Heading>
        <Text variant="body1" className="text-accent-secondary">
          {COPY.reclaim.alreadySettled.body}
        </Text>
      </div>
      <Button
        variant="contained"
        color="secondary"
        className="w-full"
        onClick={onClose}
      >
        {COPY.reclaim.alreadySettled.doneButton}
      </Button>
    </div>
  );
}
