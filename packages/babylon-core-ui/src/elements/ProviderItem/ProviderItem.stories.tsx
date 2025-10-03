import type { Meta, StoryObj } from "@storybook/react";
import { ProviderItem } from "./ProviderItem";

const meta = {
  title: "Elements/ProviderItem",
  component: ProviderItem,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "text",
      description: "Provider name",
    },
    icon: {
      control: "text",
      description: "Icon URL or React node",
    },
    iconAlt: {
      control: "text",
      description: "Alt text for icon",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
} satisfies Meta<typeof ProviderItem>;

export default meta;
type Story = StoryObj<typeof meta>;

// Bitcoin icon SVG as data URI for examples
const bitcoinIcon = "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%23FF7C2A' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z'/%3E%3C/svg%3E";

export const Default: Story = {
  args: {
    name: "Ironclad BTC",
    icon: bitcoinIcon,
  },
};

export const WithoutIcon: Story = {
  args: {
    name: "Genesis Vault",
  },
};

export const LongName: Story = {
  args: {
    name: "Atlas Custody Provider",
    icon: bitcoinIcon,
  },
};

export const MultipleProviders: Story = {
  args: {
    name: "Ironclad BTC",
    icon: bitcoinIcon,
  },
  render: () => (
    <div className="flex gap-4">
      <ProviderItem name="Ironclad BTC" icon={bitcoinIcon} />
      <ProviderItem name="Atlas Custody" icon={bitcoinIcon} />
      <ProviderItem name="Genesis Vault" icon={bitcoinIcon} />
    </div>
  ),
};

export const InCard: Story = {
  args: {
    name: "Ironclad BTC",
    icon: bitcoinIcon,
  },
  render: () => (
    <div className="w-96 bg-secondary-highlight p-4 rounded">
      <div className="flex flex-col gap-3">
        <span className="text-sm text-accent-secondary">Vault Provider(s)</span>
        <div className="flex gap-4">
          <ProviderItem name="Ironclad BTC" icon={bitcoinIcon} />
          <ProviderItem name="Atlas Custody" icon={bitcoinIcon} />
        </div>
      </div>
    </div>
  ),
};

export const WithCustomIcon: Story = {
  args: {
    name: "Custom Provider",
    icon: (
      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
        CP
      </div>
    ),
  },
};

export const Grid: Story = {
  args: {
    name: "Ironclad BTC",
    icon: bitcoinIcon,
  },
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <ProviderItem name="Ironclad BTC" icon={bitcoinIcon} />
      <ProviderItem name="Atlas Custody" icon={bitcoinIcon} />
      <ProviderItem name="Genesis Vault" icon={bitcoinIcon} />
      <ProviderItem name="Morpho Vault" icon={bitcoinIcon} />
      <ProviderItem name="Compound V3" icon={bitcoinIcon} />
      <ProviderItem name="Aave V3" icon={bitcoinIcon} />
    </div>
  ),
};

