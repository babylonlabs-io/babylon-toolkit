import type { Meta, StoryObj } from "@storybook/react";
import {
    ThemedIcon,
    BitcoinPublicKeyIcon,
    LinkWalletIcon,
    UsingInscriptionIcon,
    CopyIcon,
    CloseIcon,
    WarningIcon,
    CollapseIcon,
    OpenIcon,
    ChevronLeftIcon,
    BugReportIcon,
    ThemeIcon,
    ThreeDotsMenuIcon,
    InfoIcon,
} from ".";

const IconsGallery = () => {
    const icons = [
        { name: "CloseIcon", el: <CloseIcon size={24} /> },
        { name: "CopyIcon", el: <CopyIcon size={24} /> },
        { name: "WarningIcon", el: <WarningIcon size={24} /> },
        { name: "CollapseIcon", el: <CollapseIcon size={24} /> },
        { name: "OpenIcon", el: <OpenIcon size={24} /> },
        { name: "ChevronLeftIcon", el: <ChevronLeftIcon size={24} /> },
        { name: "BugReportIcon", el: <BugReportIcon size={24} /> },
        { name: "ThemeIcon", el: <ThemeIcon size={24} /> },
        { name: "ThreeDotsMenuIcon", el: <ThreeDotsMenuIcon size={24} /> },
        { name: "InfoIcon", el: <InfoIcon size={24} /> },
        { name: "BitcoinPublicKeyIcon", el: <BitcoinPublicKeyIcon size={24} /> },
        { name: "LinkWalletIcon", el: <LinkWalletIcon size={24} /> },
        { name: "UsingInscriptionIcon", el: <UsingInscriptionIcon size={24} /> },
    ];

    return (
        <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {icons.map(({ name, el }) => (
                    <div key={name} className="flex flex-col items-center gap-2">
                        {el}
                        <div className="text-xs text-secondary">{name}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const meta: Meta<typeof IconsGallery> = {
    title: "Components/Identity/Icons/Icons",
    component: IconsGallery,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const AllIcons: Story = {
    render: () => <IconsGallery />,
};

export const ThemedIconExamples: Story = {
    render: () => {
        const variants = [
            "default",
            "primary",
            "secondary",
            "error",
            "success",
            "accent-primary",
            "accent-secondary",
        ] as const;

        return (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {variants.map((v) => (
                    <div key={v} className="flex flex-col items-center gap-2">
                        <ThemedIcon variant={v} size={40} background rounded>
                            <CloseIcon size={16} />
                        </ThemedIcon>
                        <div className="text-xs text-secondary">ThemedIcon ({v})</div>
                    </div>
                ))}
            </div>
        );
    },
};


