import type { Meta, StoryObj } from "@storybook/react";
import { BorrowCard } from "./BorrowCard";

const meta: Meta<typeof BorrowCard> = {
  title: "Components/Cards/BorrowCard",
  component: BorrowCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "A card component for creating new borrow positions in the vault application.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onNewBorrow: () => console.log("New borrow clicked"),
  },
};

export const CustomText: Story = {
  args: {
    title: "Start Borrowing",
    description: "Create your first borrow position to get started",
    onNewBorrow: () => alert("Borrow flow started"),
  },
};

export const WithCustomStyling: Story = {
  args: {
    className: "border-2 border-primary-light",
    onNewBorrow: () => console.log("Custom styled borrow"),
  },
};

export const Interactive: Story = {
  args: {
    title: "New Vault Borrow",
    description: "Click the plus button to create a new borrow position",
    onNewBorrow: () => {
      console.log("Borrow action triggered!");
      alert("This would open the borrow modal");
    },
  },
};

