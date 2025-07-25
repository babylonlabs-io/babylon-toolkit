import { Button } from "@/components/Button";
import { Table } from "@/elements/Table";
import { Dialog, MobileDialog, DialogBody, DialogFooter, DialogHeader } from "@/components/Dialog";
import { Text } from "@/components/Text";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PropsWithChildren, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

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

interface PreviewModalProps {
    open: boolean;
    processing?: boolean;
    onClose: () => void;
    onProceed: () => void;
    bsns: Info[];
    finalityProviders: Info[];
}

export const RewardsPreviewModal = ({
    open,
    processing = false,
    onClose,
    onProceed,
    bsns,
    finalityProviders,
}: PropsWithChildren<PreviewModalProps>) => {

    return (
        <ResponsiveDialog open={open} onClose={onClose}>
            <DialogHeader title="Claim BABY Rewards" onClose={onClose} className="text-accent-primary" />
            <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto text-accent-primary">
                <Table
                    data={[
                        ["Token", "Amount Receiving"],
                        ...bsns.map((bsnItem, index) => {
                            const fpItem = finalityProviders[index];
                            return [
                                <div key={`bsn-${index}`} className="flex w-full items-center justify-center gap-2 py-1">
                                    {bsnItem.icon}
                                    <Text variant="body2" className="font-medium">
                                        {bsnItem.name}
                                    </Text>
                                </div>,
                                fpItem ? (
                                    <div key={`fp-${index}`} className="flex w-full items-center justify-center gap-2 py-1">
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
                    ]}
                />
                <div className="border-divider w-full border-t" />
            </DialogBody>
            <DialogFooter className="flex flex-col gap-4 pb-8 pt-0 sm:flex-row">
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
