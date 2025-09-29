import type { Meta, StoryObj } from "@storybook/react";
import { MdRocketLaunch } from "react-icons/md";
import { DismissibleSubSection } from "./DismissibleSubSection";
import { Text } from "../Text";

const meta: Meta<typeof DismissibleSubSection> = {
  title: "Components/Containers/Panels/DismissibleSubSection",
  component: DismissibleSubSection,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A dismissible subsection container with an optional icon, title, and content. Useful for inline notices that can be closed.",
      },
    },
  },
  args: {
    title: "Boost Your Rewards",
    content: (
      <Text variant="body1" className="text-accent-secondary">
        Stake BABY to boost your BTC rewards. The more BABY you stake, the more
        of your BTC becomes eligible for bonus rewards.
      </Text>
    ),
    icon: <MdRocketLaunch size={24} className="min-w-6 text-info-light" />,
  },
  argTypes: {
    onCloseClick: { action: "closed" },
  },
};

export default meta;

type Story = StoryObj<typeof DismissibleSubSection>;

export const Default: Story = {
  args: {},
};

export const WithCustomStyles: Story = {
  args: {
    className: "!bg-primary-main !rounded-xl",
    style: { maxWidth: 640 },
  },
};

export const WithoutIcon: Story = {
  args: {
    icon: undefined,
  },
};