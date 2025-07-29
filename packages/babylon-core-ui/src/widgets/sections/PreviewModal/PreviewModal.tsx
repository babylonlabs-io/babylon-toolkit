import { Button } from "@/components/Button";
import { WINDOW_BREAKPOINT } from "../../../utils/constants";
import { Table } from "@/elements/Table";
import { Dialog, MobileDialog, DialogBody, DialogFooter, DialogHeader } from "@/components/Dialog";
import { Heading } from "@/components/Heading";
import { Text } from "@/components/Text";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PropsWithChildren, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
  children?: ReactNode;
}

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
  /**
   * When provided, only the specified field labels will be rendered in the itemised list.
   * Labels should match the exact ones defined internally (e.g. "Stake Amount", "Transaction Fees").
   */
  visibleFields?: string[];
  /** Custom notice text displayed under "Attention!" heading. If not provided, default disclaimers are shown. */
  attentionText?: string;
  /** Label for the primary action button; defaults to "Proceed to Signing" */
  proceedLabel?: string;
}

export const PreviewModal = ({
  open,
  processing = false,
  onClose,
  onProceed,
  bsns,
  finalityProviders,
  details,
  visibleFields,
  attentionText,
  proceedLabel = "Proceed to Signing",
}: PropsWithChildren<PreviewModalProps>) => {
  const allFields = [
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

  const fields = visibleFields && visibleFields.length > 0 ? allFields.filter((f) => visibleFields.includes(f.label)) : allFields;

  // If no finality providers are supplied, we display a single-column table labelled "Validator"
  const isSingleColumn = !finalityProviders || finalityProviders.length === 0;

  const tableData = isSingleColumn
    ? [
      ["Validator"],
      ...bsns.map((item, index) => [
        <div
          key={`validator-${index}`}
          className="flex w-full items-center gap-2 py-1"
        >
          {item.icon}
          <Text variant="body2" className="font-medium">
            {item.name}
          </Text>
        </div>,
      ]),
    ]
    : [
      ["BSNs", "Finality Provider"],
      ...bsns.map((bsnItem, index) => {
        const fpItem = finalityProviders[index];
        return [
          <div
            key={`bsn-${index}`}
            className="flex w-full items-center gap-2 py-1"
          >
            {bsnItem.icon}
            <Text variant="body2" className="font-medium">
              {bsnItem.name}
            </Text>
          </div>,
          fpItem ? (
            <div
              key={`fp-${index}`}
              className="flex w-full items-center gap-2 py-1"
            >
              {fpItem.icon}
              <Text variant="body2" className="font-medium">
                {fpItem.name}
              </Text>
            </div>
          ) : (
            <div key={`fp-${index}`} />
          ),
        ];
      }),
    ];

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader title="Preview" onClose={onClose} className="text-accent-primary" />
      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto text-accent-primary">
        <Table data={tableData} />

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
          {attentionText ? (
            <Text variant="body2" className="text-secondary">
              {attentionText}
            </Text>
          ) : (
            <>
              <Text variant="body2" className="text-secondary">
                1. No third party possesses your staked BTC. You are the only one who can unbond and withdraw your
                stake.
              </Text>
              <Text variant="body2" className="text-secondary">
                2. Your stake will first be sent to Babylon Genesis for verification (~20 seconds), then you will be
                prompted to submit it to the Bitcoin ledger. It will be marked as 'Pending' until it receives 10
                Bitcoin confirmations.
              </Text>
            </>
          )}
        </div>
      </DialogBody>
      <DialogFooter className="flex flex-col gap-4 pb-8 pt-0 sm:flex-row">
        <Button variant="contained" color="primary" onClick={onProceed} className="w-full sm:flex-1 sm:order-2" disabled={processing}>
          {processing ? "Processing..." : proceedLabel}
        </Button>
        <Button variant="outlined" color="primary" onClick={onClose} className="w-full sm:flex-1 sm:order-1">
          Cancel
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
};
