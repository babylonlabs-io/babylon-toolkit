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

const finalityProviderOptions: Option[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "allowlisted", label: "Allowlisted" },
  { value: "non-allowlisted", label: "Non-allowlisted" },
  { value: "slashed", label: "Slashed" },
  { value: "jailed", label: "Jailed" },
];

export const ResponsiveTruncation: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Wide Container (400px)</h3>
        <div className="w-96">
          <Select 
            options={finalityProviderOptions}
            value="non-allowlisted"
            renderSelectedOption={(option) => `Showing ${option.label}`}
            placeholder="Select Status"
          />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Medium Container (250px)</h3>
        <div style={{ width: '250px' }}>
          <Select 
            options={finalityProviderOptions}
            value="non-allowlisted"
            renderSelectedOption={(option) => `Showing ${option.label}`}
            placeholder="Select Status"
          />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Narrow Container (180px)</h3>
        <div style={{ width: '180px' }}>
          <Select 
            options={finalityProviderOptions}
            value="non-allowlisted"
            renderSelectedOption={(option) => `Showing ${option.label}`}
            placeholder="Select Status"
          />
        </div>
      </div>
    </div>
  ),
};

export const VariousTextLengths: Story = {
  render: () => {
    const [selectedValues, setSelectedValues] = useState({
      short: "active",
      medium: "inactive", 
      long: "non-allowlisted",
      veryLong: "allowlisted"
    });

    return (
      <div className="space-y-4">
        <div className="w-64 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Short text: "Active"</label>
            <Select 
              options={[{ value: "active", label: "Active" }]}
              value={selectedValues.short}
              onSelect={(val) => setSelectedValues(prev => ({ ...prev, short: val.toString() }))}
              renderSelectedOption={(option) => option.label}
            />
          </div>
          
          <div>
            <label className="text-xs text-gray-500 block mb-1">Medium text: "Showing Inactive"</label>
            <Select 
              options={finalityProviderOptions}
              value={selectedValues.medium}
              onSelect={(val) => setSelectedValues(prev => ({ ...prev, medium: val.toString() }))}
              renderSelectedOption={(option) => `Showing ${option.label}`}
            />
          </div>
          
          <div>
            <label className="text-xs text-gray-500 block mb-1">Long text: "Showing Non-allowlisted" (truncates with tooltip)</label>
            <Select 
              options={finalityProviderOptions}
              value={selectedValues.long}
              onSelect={(val) => setSelectedValues(prev => ({ ...prev, long: val.toString() }))}
              renderSelectedOption={(option) => `Showing ${option.label}`}
            />
          </div>
          
          <div>
            <label className="text-xs text-gray-500 block mb-1">Very long text with additional context (truncates)</label>
            <Select 
              options={finalityProviderOptions}
              value={selectedValues.veryLong}
              onSelect={(val) => setSelectedValues(prev => ({ ...prev, veryLong: val.toString() }))}
              renderSelectedOption={(option) => `Showing ${option.label} Finality Providers`}
            />
          </div>
        </div>
        
        <div className="mt-4 text-xs text-gray-500">
          <p>Long hover (1-2 seconds) over truncated text shows native browser tooltip with full content</p>
        </div>
      </div>
    );
  },
};

