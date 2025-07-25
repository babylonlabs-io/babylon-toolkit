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
        finalityProviders: [
            {
                icon: <PlaceholderIcon text="F1" bgColor="bg-black" />,
                name: "100",
            },
            {
                icon: <PlaceholderIcon text="F2" bgColor="bg-black" />,
                name: "3000",
            },
        ],
    },
}; 