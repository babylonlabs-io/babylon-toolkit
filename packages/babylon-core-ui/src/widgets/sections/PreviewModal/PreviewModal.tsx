import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Dialog, MobileDialog, DialogBody, DialogFooter, DialogHeader } from "@/components/Dialog";
import { Heading } from "@/components/Heading";
import { Text } from "@/components/Text";
import { PropsWithChildren, ReactNode, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
  children?: ReactNode;
}

function useIsMobileView() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isMobile;
}

function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
  const isMobileView = useIsMobileView();
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
                  <div key={`bsn-${index}`} className="flex w-full items-center justify-center gap-2 py-1">
                    {bsnItem.icon}
                    <Text variant="body2" className="font-medium">
                      {bsnItem.name}
                    </Text>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {finalityProviders.map((fpItem, index) => (
                  <div key={`fp-${index}`} className="flex w-full items-center justify-center gap-2 py-1">
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
            <br />
          </Text>
          <br />
          <Text variant="body2" className="text-secondary">
            2. Your stake will first be sent to Babylon Genesis for verification (~20 seconds), then you will be
            prompted to submit it to the Bitcoin ledger. It will be marked as &apos;Pending&apos; until it receives 10
            Bitcoin confirmations.
          </Text>
        </div>
      </DialogBody>
      <DialogFooter className="flex gap-4 pb-8 pt-0">
        <Button variant="outlined" color="primary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button variant="contained" color="primary" onClick={onProceed} className="flex-1" disabled={processing}>
          {processing ? "Processing..." : "Proceed to Signing"}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
};
