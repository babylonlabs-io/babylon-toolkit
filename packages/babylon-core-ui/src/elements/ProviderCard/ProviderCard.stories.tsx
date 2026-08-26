import type { Meta, StoryObj } from "@storybook/react";
import { ProviderCard } from "./ProviderCard";
import { Text } from "@/components/Text";

const meta: Meta<typeof ProviderCard> = {
  title: "Elements/ProviderCard",
  component: ProviderCard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    id: {
      control: "text",
      description: "Unique identifier for the provider",
    },
    name: {
      control: "text",
      description: "Provider name",
    },
    isSelected: {
      control: "boolean",
      description: "Whether the provider is selected",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * An unselected provider card
 */
export const Unselected: Story = {
  args: {
    id: "provider-1",
    name: "Ironclad BTC",
    icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">I</Text>,
    isSelected: false,
    onToggle: (id: string) => console.log("Toggle", id),
  },
};

/**
 * A selected provider card
 */
export const Selected: Story = {
  args: {
    id: "provider-2",
    name: "Atlas Custody",
    icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">A</Text>,
    isSelected: true,
    onToggle: (id: string) => console.log("Toggle", id),
  },
};

/**
 * Provider card without details section
 */
export const NoDetails: Story = {
  args: {
    id: "provider-3",
    name: "Stonewall Capital",
    icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">S</Text>,
    isSelected: false,
    onToggle: (id: string) => console.log("Toggle", id),
  },
};

/**
 * Multiple provider cards in a list
 */
export const ProviderList: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-[600px]">
      <ProviderCard
        id="ironclad-btc"
        name="Ironclad BTC"
        icon={<Text variant="body2" className="text-sm font-medium text-accent-contrast">I</Text>}
        isSelected={true}
        onToggle={(id: string) => console.log("Toggle", id)}
      />
      <ProviderCard
        id="atlas-custody"
        name="Atlas Custody"
        icon={<Text variant="body2" className="text-sm font-medium text-accent-contrast">A</Text>}
        isSelected={true}
        onToggle={(id: string) => console.log("Toggle", id)}
      />
      <ProviderCard
        id="stonewall-capital"
        name="Stonewall Capital"
        icon={<Text variant="body2" className="text-sm font-medium text-accent-contrast">S</Text>}
        isSelected={false}
        onToggle={(id: string) => console.log("Toggle", id)}
      />
    </div>
  ),
};

