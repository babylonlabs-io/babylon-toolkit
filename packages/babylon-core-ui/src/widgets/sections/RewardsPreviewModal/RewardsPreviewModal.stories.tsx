import type { Meta, StoryObj } from "@storybook/react";
import { RewardsPreviewModal } from "./RewardsPreviewModal";

const PlaceholderIcon = ({
    text,
    bgColor = "bg-primary-300",
}: {
    text: string;
    bgColor?: string;
}) => (
    <div
        className={`${bgColor} flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-white`}
    >
        {text}
    </div>
);

const meta: Meta<typeof RewardsPreviewModal> = {
    component: RewardsPreviewModal,
    tags: ["autodocs"],
};

export default meta;

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        open: true,
        processing: false,
        onClose: () => { },
        onProceed: () => { },
        bsns: [
            {
                icon: <PlaceholderIcon text="B1" bgColor="bg-black" />,
                name: "Token 1",
            },
            {
                icon: <PlaceholderIcon text="B2" bgColor="bg-black" />,
                name: "Token 2",
            },
        ],
        amount: {
            token: "100.000 BABY",
            usd: "$6,677.15 USD",
        },
        transactionFees: {
            token: "10 BABY",
            usd: "$0.56 USD",
        },
        warning: "Processing your claim will take approximately 2 blocks to complete. BABY is a test token without any real world value.",
        title: "Claim BABY Rewards",
    },
};

export const OneReceivingToken: Story = {
    args: {
        open: true,
        processing: false,
        onClose: () => { },
        onProceed: () => { },
        bsns: [
            {
                icon: <PlaceholderIcon text="B1" bgColor="bg-black" />,
                name: "Token 1",
            },
        ],
        amount: {
            token: "100.000 BABY",
            usd: "$6,677.15 USD",
        },
        transactionFees: {
            token: "10 BABY",
            usd: "$0.56 USD",
        },
        warning: "Processing your claim will take approximately 2 blocks to complete. BABY is a test token without any real world value.",
        title: "Claim BABY Rewards",
    },
}; 