import type { Meta, StoryObj } from "@storybook/react";
import { Hint } from "./Hint";
import { WarningIcon, InfoIcon } from "../Icons";
import "react-tooltip/dist/react-tooltip.css";

const meta: Meta<typeof Hint> = {
  title: "Components/Hint",
  component: Hint,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Hover over me for a hint",
    tooltip: "This is a helpful hint that provides additional context",
    attachToChildren: true,
  },
};

export const WithSeparateIcon: Story = {
  args: {
    children: "Important information",
    tooltip: "This shows a separate info icon that you can click for more details",
    attachToChildren: false,
  },
};

export const WithCustomIcon: Story = {
  args: {
    children: "Warning message",
    tooltip: "This is a warning that requires your attention",
    icon: <WarningIcon size={16} variant="error" />,
    status: "warning",
  },
};

export const ErrorStatus: Story = {
  args: {
    children: "Error occurred",
    tooltip: "This is an error message with detailed information about what went wrong",
    status: "error",
  },
};

export const ComplexTooltip: Story = {
  args: {
    children: "Complex tooltip example",
    tooltip: (
      <div className="space-y-2">
        <h4 className="font-semibold">Advanced Tooltip</h4>
        <p>This tooltip can contain any React content:</p>
        <ul className="list-disc list-inside text-sm">
          <li>Multiple lines of text</li>
          <li>Formatted content</li>
          <li>Even other components</li>
        </ul>
      </div>
    ),
  },
};

export const LongText: Story = {
  args: {
    children: "Linked Wallet Stakes",
    tooltip: "Linked Wallet Stakes show all stakes created with the same Bitcoin wallet, even if different BABY wallets were used. It helps you track and manage them in one place.",
    icon: <InfoIcon size={14} variant="secondary" />,
  },
};
