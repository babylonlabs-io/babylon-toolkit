import { Dialog, MobileDialog, DialogBody, DialogHeader, DialogFooter } from "@/components/Dialog";
import { Text } from "@/components/Text";
import { AmountItem } from "@/components/AmountItem";
import { SubSection } from "@/components/SubSection";
import { Warning } from "@/components/Warning";
import { Button } from "@/components/Button";
import { WINDOW_BREAKPOINT, MAX_WINDOW_HEIGHT } from "../../../utils/constants";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface BalanceDetails {
    balance: number | string;
    symbol: string;
    price?: number;
    displayUSD?: boolean;
    decimals?: number;
}

interface RewardData {
    amount: string | number | undefined;
    currencyIcon: string;
    currencyName: string;
    placeholder?: string;
    displayBalance?: boolean;
    balanceDetails?: BalanceDetails;
    min?: string;
    step?: string;
    chainName?: string;
    subtitle?: string;
    /** Amount currently staked */
    stakedAmount?: string | number;
    /** Token name for the staked amount display */
    stakedTokenName?: string;
}

interface UnbondingModalProps {
    open: boolean;
    onClose: () => void;
    /** Optional title for the dialog – defaults to "Unbonding" */
    title?: string;
    /** Optional description text to display in the modal */
    description?: string;
    /** Reward data for the AmountItem */
    reward: RewardData;
    /** USD amount display */
    amountUsd?: string;
    /** onChange handler for the amount input */
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    /** onKeyDown handler for the amount input */
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    /** Whether the amount input should be disabled */
    disabled?: boolean;
    /** Warning text to display below the amount section */
    warningText?: string;
    /** Text for the action button */
    actionButtonText?: string;
    /** Click handler for the action button */
    onActionClick?: () => void;
}

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
    children?: ReactNode;
}

function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
    const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
    const DialogComponent = isMobileView ? MobileDialog : Dialog;

    return <DialogComponent {...restProps} className={twMerge("w-[41.25rem] max-w-full", className)} />;
}

export const UnbondingModal = ({
    open,
    onClose,
    title = "Unbonding",
    description,
    reward,
    amountUsd = "",
    onChange = () => { },
    onKeyDown = () => { },
    disabled = false,
    warningText,
    actionButtonText = "Unbond",
    onActionClick,
}: UnbondingModalProps) => {
    return (
        <ResponsiveDialog open={open} onClose={onClose}>
            <DialogHeader title={title} onClose={onClose} className="text-accent-primary" />
            <DialogBody
                style={{ maxHeight: MAX_WINDOW_HEIGHT }}
                className="no-scrollbar mt-4 flex flex-col gap-6 overflow-y-auto text-accent-primary"
            >
                {description && (
                    <div>
                        <Text variant="body2" className="text-accent-secondary whitespace-pre-line">
                            {description}
                        </Text>
                    </div>
                )}
                <SubSection className="flex w-full flex-col content-center justify-between gap-4">
                    <AmountItem
                        amount={reward.amount}
                        currencyIcon={reward.currencyIcon}
                        currencyName={reward.currencyName}
                        placeholder={reward.placeholder ?? "Enter Amount"}
                        displayBalance={reward.displayBalance}
                        balanceDetails={reward.balanceDetails}
                        min={reward.min ?? "0"}
                        step={reward.step ?? "any"}
                        autoFocus={false}
                        onChange={onChange}
                        onKeyDown={onKeyDown}
                        amountUsd={amountUsd}
                        disabled={disabled}
                        subtitle={`Staked: ${reward.stakedAmount || 0} ${reward.stakedTokenName || reward.currencyName}`}
                    />
                </SubSection>
                {warningText && (
                    <Warning>
                        {warningText}
                    </Warning>
                )}
            </DialogBody>
            {actionButtonText && (
                <DialogFooter className="flex justify-end mt-[80px]">
                    <Button
                        onClick={onActionClick}
                    >
                        {actionButtonText}
                    </Button>
                </DialogFooter>
            )}
        </ResponsiveDialog>
    );
}; 