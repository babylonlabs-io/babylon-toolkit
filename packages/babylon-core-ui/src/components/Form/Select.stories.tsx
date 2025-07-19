import type { Meta, StoryObj } from "@storybook/react";

import { Select, type Option } from "./Select";
import { useState } from "react";

const meta: Meta<typeof Select> = {
  component: Select,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

const options: Option[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "pending", label: "Pending" },
];

export const Default: Story = {
  args: {
    options,
    placeholder: "Select status",
    onSelect: console.log,
  },
};

export const Controlled: Story = {
  render: (args) => {
    const defaultValue = args.defaultValue ?? "pending";
    const [value, setValue] = useState<string | number>(defaultValue);

    return (
      <div className="space-y-4">
        <Select {...args} value={value} onSelect={(val) => setValue(val)} />
        <p>Default value: {defaultValue}</p>
        <p>Selected value: {value}</p>
      </div>
    );
  },
  args: {
    defaultValue: "active",
    options,
    placeholder: "Select status",
    onSelect: console.log,
  },
};

export const Disabled: Story = {
  args: {
    options,
    placeholder: "Select status",
    disabled: true,
  },
};

export const CustomSelectedDisplay: Story = {
  args: {
    options,
    placeholder: "Select status",
    renderSelectedOption: (option: Option) => `Showing ${option.value}`,
  },
};
