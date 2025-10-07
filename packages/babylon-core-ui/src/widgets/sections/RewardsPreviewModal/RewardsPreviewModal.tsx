import { Button } from "@/components/Button";
import { WINDOW_BREAKPOINT } from "../../../utils/constants";
import { Dialog, MobileDialog, DialogBody, DialogFooter, DialogHeader } from "@/components/Dialog";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PropsWithChildren, ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { FeeItem } from "@/components/FeeItem/FeeItem";

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
  children?: ReactNode;
}
function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
  const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  return <DialogComponent {...restProps} className={twMerge("w-[41.25rem] max-w-full", className)} />;
}
interface TokenReward {
  icon?: ReactNode;
  name: string;
  amount?: {
    token: string;
    usd: string;
  };
}

interface PreviewModalProps {
  open: boolean;
  processing?: boolean;
  title: string;
  onClose: () => void;
  onProceed: () => void;
  tokens: TokenReward[];
  transactionFees: {
    token: string;
    usd: string;
  };
}

export const RewardsPreviewModal = ({
  open,
  processing = false,
  title,
  onClose,
  onProceed,
  tokens,
  transactionFees,
}: PropsWithChildren<PreviewModalProps>) => {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader title={title} className="text-accent-primary" />
      <DialogBody className="no-scrollbar mb-[40px] mt-8 flex max-h-[calc(100vh-12rem)] flex-col overflow-y-auto text-accent-primary">
        <div className="flex flex-col">
          <div className="max-h-[300px] overflow-y-auto">
            {tokens.map((token, index) => (
              <div key={`token-${index}`}>
                <FeeItem title={token.name} hint={token.amount?.usd}>
                  <div className="flex items-center gap-2">
                    {token.icon}
                    {token.amount?.token}
                  </div>
                </FeeItem>
                {index < tokens.length - 1 && <div className="h-4" />}
              </div>
            ))}
          </div>

          {transactionFees.token && parseFloat(transactionFees.token) > 0 && (
            <>
              <div className="py-6">
                <div className="border-divider w-full border-t" />
              </div>

              <FeeItem title="Transaction Fees" hint={transactionFees.usd}>
                {transactionFees.token}
              </FeeItem>
            </>
          )}
        </div>
      </DialogBody>
      <DialogFooter className="flex flex-col gap-4 pt-0 sm:flex-row">
        <Button
          variant="contained"
          color="primary"
          onClick={onProceed}
          className="w-full sm:order-2 sm:flex-1"
          disabled={processing}
        >
          {processing ? "Processing..." : "Proceed"}
        </Button>
        <Button variant="outlined" color="primary" onClick={onClose} className="w-full sm:order-1 sm:flex-1">
          Cancel
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
};
