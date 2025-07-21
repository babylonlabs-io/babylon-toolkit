import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { WalletToggle } from "./WalletToggle";

const meta: Meta<typeof WalletToggle> = {
  component: WalletToggle,
  tags: ["autodocs"],
  title: "Elements/WalletToggle",
  argTypes: {
    value: {
      control: "boolean",
      description: "Toggle state (on/off)",
    },
    disabled: {
      control: "boolean",
      description: "Whether the toggle is disabled",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value || false);
    
    return (
      <div className="p-4">
        <WalletToggle 
          {...args}
          value={value}
          onChange={setValue}
        />
        <p className="mt-2 text-sm text-gray-600">
          Current state: {value ? 'ON' : 'OFF'}
        </p>
      </div>
    );
  },
  args: {
    value: false,
    disabled: false,
  },
};


export const Disabled: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value || false);
    
    return (
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-2">Disabled</h3>
          <WalletToggle 
            value={true}
            onChange={setValue}
            disabled={true}
          />
        </div>
      </div>
    );
  },
  args: {
    disabled: true,
  },
};
