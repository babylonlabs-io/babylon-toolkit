import type { Meta, StoryObj } from "@storybook/react";

import { Warning } from "./Warning";

const meta: Meta<typeof Warning> = {
    title: "Components/Data Display/Indicators/Warning",
    component: Warning,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        children:
            "Processing your claim will take approximately 2 blocks to complete. BABY is a test token without any real world value.",
    },
};

export const LongText: Story = {
    args: {
        children:
            "This is a very long warning message meant to test how the component behaves when the text spans multiple lines. It should wrap correctly and keep the icon aligned at the top of the message. You can also include more details here for the user to read without breaking the layout of the warning component.",
    },
};

export const CustomAltText: Story = {
    args: {
        children: "Custom alt text is provided for better accessibility.",
    },
};

export const CustomStyled: Story = {
    args: {
        children: "This warning box has a custom max-width and is centered using Tailwind utility classes.",
    },
}; 