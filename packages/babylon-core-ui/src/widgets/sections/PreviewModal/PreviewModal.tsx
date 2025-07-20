import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Dialog, MobileDialog, DialogBody, DialogFooter, DialogHeader } from "@/components/Dialog";
import { Heading } from "@/components/Heading";
import { Text } from "@/components/Text";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PropsWithChildren, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

const toKebabCase = (str: string): string => {
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i].toLowerCase();

    if ((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')) {
      result += char;
    } else if (result.length > 0 && result[result.length - 1] !== '-') {
      result += '-';
    }
  }

  if (result.endsWith('-')) {
    result = result.slice(0, -1);
  }

  return result;
};

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
  children?: ReactNode;
}

const WINDOW_BREAKPOINT = 640;

function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
  const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  return <DialogComponent {...restProps} className={twMerge("w-[41.25rem] max-w-full", className)} />;
}

interface Info {
  icon: ReactNode;
  name: string;
}

interface StakingTerm {
  blocks: string;
  duration: string;
}

interface StakingDetails {
  stakeAmount: string;
  feeRate: string;
  transactionFees: string;
  term: StakingTerm;
  unbonding: string;
  unbondingFee: string;
}

interface PreviewModalProps {
  open: boolean;
  processing?: boolean;
  onClose: () => void;
  onProceed: () => void;
  bsns: Info[];
  finalityProviders: Info[];
  details: StakingDetails;
}

export const PreviewModal = ({
  open,
  processing = false,
  onClose,
  onProceed,
  bsns,
  finalityProviders,
  details,
}: PropsWithChildren<PreviewModalProps>) => {
  const fields = [
    { label: "Stake Amount", value: details.stakeAmount },
    { label: "Fee Rate", value: details.feeRate },
    { label: "Transaction Fees", value: details.transactionFees },
    {
      label: "Term",
      value: (
        <>
          {details.term.blocks}
          <br />
          <span className="text-md text-secondary">{details.term.duration}</span>
        </>
      ),
    },
    { label: "Unbonding", value: details.unbonding },
    { label: "Unbonding Fee", value: details.unbondingFee },
  ];

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader title="Preview" onClose={onClose} className="text-accent-primary" />
      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto text-accent-primary">
        <Card className="p-6 pt-4">
          <div className="flex flex-col">
            {bsns.length > 1 ? (
              <div className="grid grid-cols-2 items-center gap-4 pb-4">
                <Text variant="caption" className="text-secondary text-center">
                  BSNs
                </Text>
                <Text variant="caption" className="text-secondary text-center">
                  Finality Provider
                </Text>
              </div>
            ) : null}
            <div className="grid grid-cols-2 items-center gap-4 rounded bg-primary-contrast p-4">
              <div className="flex flex-col gap-3">
                {bsns.map((bsnItem, index) => (
                  <div key={`bsn-${toKebabCase(bsnItem.name)}-${index}`} className="flex w-full items-center justify-center gap-2 py-1">
                    {bsnItem.icon}
                    <Text variant="body2" className="font-medium">
                      {bsnItem.name}
                    </Text>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {finalityProviders.map((fpItem, index) => (
                  <div key={`fp-${toKebabCase(fpItem.name)}-${index}`} className="flex w-full items-center justify-center gap-2 py-1">
                    {fpItem.icon}
                    <Text variant="body2" className="font-medium">
                      {fpItem.name}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col">
          {fields.map((field, index) => (
            <div key={index} className="flex flex-row items-center justify-between py-3">
              <Text variant="body1" className="text-secondary font-normal">
                {field.label}
              </Text>
              <Text variant="body1" className="text-right font-normal">
                {field.value}
              </Text>
            </div>
          ))}
        </div>

        <div className="border-divider w-full border-t" />

        <div className="pt-2">
          <Heading variant="h6" className="text-primary mb-2">
            Attention!
          </Heading>
          <Text variant="body2" className="text-secondary">
            1. No third party possesses your staked BTC. You are the only one who can unbond and withdraw your stake.
          </Text>
          <Text variant="body2" className="text-secondary">
            2. Your stake will first be sent to Babylon Genesis for verification (~20 seconds), then you will be
            prompted to submit it to the Bitcoin ledger. It will be marked as &apos;Pending&apos; until it receives 10
            Bitcoin confirmations.
          </Text>
        </div>
      </DialogBody>
      <DialogFooter className="flex flex-col gap-4 pb-8 pt-0 sm:flex-row">
        <Button variant="contained" color="primary" onClick={onProceed} className="w-full sm:flex-1 sm:order-2" disabled={processing}>
          {processing ? "Processing..." : "Proceed to Signing"}
        </Button>
        <Button variant="outlined" color="primary" onClick={onClose} className="w-full sm:flex-1 sm:order-1">
          Cancel
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
};
