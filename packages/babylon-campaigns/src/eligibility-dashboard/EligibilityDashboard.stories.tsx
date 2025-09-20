import type { Meta, StoryObj } from "@storybook/react";
import { EligibilityDashboard } from "./EligibilityDashboard";
import { EligibilityProvider } from "./context/EligibilityDashboard.context";

const meta: Meta<typeof EligibilityDashboard> = {
  title: "Campaigns/EligibilityDashboard",
  component: EligibilityDashboard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the component",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  decorators: [
    (Story) => (
      <EligibilityProvider>
        <Story />
      </EligibilityProvider>
    ),
  ],
};

export const WithCustomClass: Story = {
  args: {
    className: "max-w-md",
  },
};
