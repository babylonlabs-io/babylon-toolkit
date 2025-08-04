import { Button } from "@/components/Button";
import { Warning } from "@/components/Warning";
import { WINDOW_BREAKPOINT } from "../../../utils/constants"
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
interface Info {
    icon: ReactNode;
    name: string;
}

interface PreviewModalProps {
    open: boolean;
    processing?: boolean;
    title: string;
    onClose: () => void;
    onProceed: () => void;
    warning: string;
    bsns: Info[];
    amount: {
        token: string;
        usd: string;
    };
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
    bsns,
    warning,
    amount,
    transactionFees,
}: PropsWithChildren<PreviewModalProps>) => {

    return (
        <ResponsiveDialog open={open} onClose={onClose}>
            <DialogHeader title={title} className="text-accent-primary" />
            <DialogBody className="no-scrollbar mb-[40px] mt-8 flex max-h-[calc(100vh-12rem)] flex-col gap-[40px] overflow-y-auto text-accent-primary">
                <div className="flex flex-col gap-2">
                    <FeeItem title="Receiving">
                        <div className="flex flex-col items-end gap-1">
                            {bsns.map((item, index) => (
                                <div key={`bsn-${index}`} className="flex items-center gap-2">
                                    {item.icon}
                                    {item.name}
                                </div>
                            ))}
                        </div>
                    </FeeItem>

                    <div className="border-divider w-full border-t" />

                    <FeeItem title="Amount" hint={amount.usd}>
                        {amount.token}
                    </FeeItem>

                    <div className="border-divider w-full border-t" />

                    <FeeItem title="Transaction Fees" hint={transactionFees.usd}>
                        {transactionFees.token}
                    </FeeItem>
                </div>
                <Warning>{warning}</Warning>
            </DialogBody>
            <DialogFooter className="flex flex-col gap-4 pt-0 sm:flex-row">
                <Button variant="contained" color="primary" onClick={onProceed} className="w-full sm:flex-1 sm:order-2" disabled={processing}>
                    {processing ? "Processing..." : "Proceed"}
                </Button>
                <Button variant="outlined" color="primary" onClick={onClose} className="w-full sm:flex-1 sm:order-1">
                    Cancel
                </Button>
            </DialogFooter>
        </ResponsiveDialog>
    );
};
