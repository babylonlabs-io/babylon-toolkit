import type { Meta, StoryObj } from "@storybook/react";
import { ActivityList } from "./ActivityList";

const meta: Meta<typeof ActivityList> = {
  title: "Components/Lists/ActivityList",
  component: ActivityList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "A container component for displaying a list of items with an add button. Commonly used for vault positions or activity feeds.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onNewItem: () => console.log("New item clicked"),
  },
};

export const VaultPositions: Story = {
  args: {
    onNewItem: () => console.log("Create new vault position"),
  },
};

export const WithCustomStyling: Story = {
  args: {
    className: "border-2 border-primary-light",
    onNewItem: () => console.log("Custom styled list"),
  },
};

