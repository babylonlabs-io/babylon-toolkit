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
        tokens: [
            {
                icon: <PlaceholderIcon text="B1" bgColor="bg-black" />,
                name: "Babylon Genesis",
                amount: {
                    token: "1000 BABY",
                    usd: "~ $5,677.39 USD",
                },
            },
            {
                icon: <PlaceholderIcon text="C" bgColor="bg-blue-500" />,
                name: "Cosmos",
                amount: {
                    token: "500 ATOM",
                    usd: "~ $2,621.78 USD",
                },
            },
            {
                name: "Sui",
                amount: {
                    token: "100 SUI",
                    usd: "~ $399.79 USD",
                },
            },
        ],
        transactionFees: {
            token: "10 BABY",
            usd: "$0.56 USD",
        },
        title: "Claim Rewards",
    },
};

export const OneReceivingToken: Story = {
    args: {
        open: true,
        processing: false,
        onClose: () => { },
        onProceed: () => { },
        tokens: [
            {
                icon: <PlaceholderIcon text="B1" bgColor="bg-black" />,
                name: "Babylon Genesis",
                amount: {
                    token: "1000 BABY",
                    usd: "~ $5,677.39 USD",
                },
            },
        ],
        transactionFees: {
            token: "10 BABY",
            usd: "$0.56 USD",
        },
        title: "Claim BABY Rewards",
    },
};

export const TokensWithoutIcons: Story = {
    args: {
        open: true,
        processing: false,
        onClose: () => { },
        onProceed: () => { },
        tokens: [
            {
                name: "Babylon Genesis",
                amount: {
                    token: "1000 BABY",
                    usd: "~ $5,677.39 USD",
                },
            },
            {
                name: "Cosmos",
                amount: {
                    token: "500 ATOM",
                    usd: "~ $2,621.78 USD",
                },
            },
        ],
        transactionFees: {
            token: "10 BABY",
            usd: "$0.56 USD",
        },
        title: "Claim Rewards - No Icons",
    },
};

export const LongTokenList: Story = {
    args: {
        open: true,
        processing: false,
        onClose: () => { },
        onProceed: () => { },
        tokens: [
            {
                icon: <PlaceholderIcon text="B" bgColor="bg-black" />,
                name: "Babylon Genesis",
                amount: {
                    token: "1000 BABY",
                    usd: "~ $5,677.39 USD",
                },
            },
            {
                icon: <PlaceholderIcon text="C" bgColor="bg-blue-500" />,
                name: "Cosmos",
                amount: {
                    token: "500 ATOM",
                    usd: "~ $2,621.78 USD",
                },
            },
            {
                icon: <PlaceholderIcon text="S" bgColor="bg-green-500" />,
                name: "Sui",
                amount: {
                    token: "100 SUI",
                    usd: "~ $399.79 USD",
                },
            },
            {
                icon: <PlaceholderIcon text="E" bgColor="bg-purple-500" />,
                name: "Ethereum",
                amount: {
                    token: "2.5 ETH",
                    usd: "~ $8,250.00 USD",
                },
            },
            {
                icon: <PlaceholderIcon text="B" bgColor="bg-orange-500" />,
                name: "Bitcoin",
                amount: {
                    token: "0.15 BTC",
                    usd: "~ $6,450.00 USD",
                },
            },
            {
                name: "Polygon",
                amount: {
                    token: "2000 MATIC",
                    usd: "~ $1,800.00 USD",
                },
            },
            {
                icon: <PlaceholderIcon text="A" bgColor="bg-red-500" />,
                name: "Avalanche",
                amount: {
                    token: "150 AVAX",
                    usd: "~ $5,250.00 USD",
                },
            },
            {
                name: "Solana",
                amount: {
                    token: "25 SOL",
                    usd: "~ $2,750.00 USD",
                },
            },
            {
                icon: <PlaceholderIcon text="D" bgColor="bg-yellow-500" />,
                name: "Dogecoin",
                amount: {
                    token: "10000 DOGE",
                    usd: "~ $800.00 USD",
                },
            },
            {
                name: "Cardano",
                amount: {
                    token: "5000 ADA",
                    usd: "~ $2,000.00 USD",
                },
            },
        ],
        transactionFees: {
            token: "15 BABY",
            usd: "$0.84 USD",
        },
        title: "Claim Large Rewards - Scrollable List",
    },
}; 