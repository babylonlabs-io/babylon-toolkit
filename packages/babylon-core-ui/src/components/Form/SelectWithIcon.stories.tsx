import type { Meta, StoryObj } from "@storybook/react";

import { SelectWithIcon, type OptionWithIcon } from "./SelectWithIcon";
import { useState } from "react";

const meta: Meta<typeof SelectWithIcon> = {
  title: "Components/Inputs/Controls/SelectWithIcon",
  component: SelectWithIcon,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

const optionsWithAvatars: OptionWithIcon[] = [
  {
    value: "provider-1",
    label: "Vault Provider Alpha",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-main text-sm font-semibold text-white">
        A
      </div>
    ),
  },
  {
    value: "provider-2",
    label: "Vault Provider Beta",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-main text-sm font-semibold text-white">
        B
      </div>
    ),
  },
  {
    value: "provider-3",
    label: "Vault Provider Gamma",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-main text-sm font-semibold text-white">
        G
      </div>
    ),
  },
];

const optionsWithEmoji: OptionWithIcon[] = [
  { value: "bitcoin", label: "Bitcoin", icon: <span className="text-xl">₿</span> },
  { value: "ethereum", label: "Ethereum", icon: <span className="text-xl">Ξ</span> },
  { value: "defi", label: "DeFi Protocol", icon: <span className="text-xl">🏦</span> },
  { value: "staking", label: "Staking Service", icon: <span className="text-xl">💰</span> },
];

const optionsWithColoredIcons: OptionWithIcon[] = [
  {
    value: "app-1",
    label: "DeFi Protocol Alpha",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded bg-purple-500 text-sm font-bold text-white">
        D
      </div>
    ),
  },
  {
    value: "app-2",
    label: "Staking Platform Beta",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-500 text-sm font-bold text-white">
        S
      </div>
    ),
  },
  {
    value: "app-3",
    label: "Lending Service Gamma",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded bg-green-500 text-sm font-bold text-white">
        L
      </div>
    ),
  },
  {
    value: "app-4",
    label: "Yield Optimizer Delta",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded bg-orange-500 text-sm font-bold text-white">
        Y
      </div>
    ),
  },
];

export const Default: Story = {
  args: {
    options: optionsWithAvatars,
    placeholder: "Select a vault provider",
    onSelect: console.log,
  },
};

export const Controlled: Story = {
  render: (args) => {
    const defaultValue = args.defaultValue ?? "provider-2";
    const [value, setValue] = useState<string | number>(defaultValue);

    return (
      <div className="space-y-4">
        <SelectWithIcon
          {...args}
          value={value}
          onSelect={(val) => setValue(val)}
        />
        <p>Default value: {defaultValue}</p>
        <p>Selected value: {value}</p>
      </div>
    );
  },
  args: {
    defaultValue: "provider-2",
    options: optionsWithAvatars,
    placeholder: "Select a vault provider",
    onSelect: console.log,
  },
};

export const Disabled: Story = {
  args: {
    options: optionsWithAvatars,
    placeholder: "Select a vault provider",
    disabled: true,
    value: "provider-1",
  },
};

export const WithEmoji: Story = {
  args: {
    options: optionsWithEmoji,
    placeholder: "Select a network",
    onSelect: console.log,
  },
};

export const WithColoredIcons: Story = {
  args: {
    options: optionsWithColoredIcons,
    placeholder: "Select an application",
    onSelect: console.log,
  },
};

export const ErrorState: Story = {
  args: {
    options: optionsWithAvatars,
    placeholder: "Select a vault provider",
    state: "error",
    onSelect: console.log,
  },
};

export const WarningState: Story = {
  args: {
    options: optionsWithAvatars,
    placeholder: "Select a vault provider",
    state: "warning",
    onSelect: console.log,
  },
};

export const ResponsiveTruncation: Story = {
  render: () => {
    const longOptions: OptionWithIcon[] = [
      {
        value: "1",
        label: "Very Long Application Name That Should Truncate",
        icon: (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-main text-sm font-semibold text-white">
            V
          </div>
        ),
      },
      {
        value: "2",
        label: "Another Super Long Provider Name Example",
        icon: (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-main text-sm font-semibold text-white">
            A
          </div>
        ),
      },
      {
        value: "3",
        label: "Short Name",
        icon: (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-main text-sm font-semibold text-white">
            S
          </div>
        ),
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium">Wide Container (400px)</h3>
          <div className="w-96">
            <SelectWithIcon
              options={longOptions}
              value="1"
              placeholder="Select application"
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Medium Container (250px)</h3>
          <div style={{ width: "250px" }}>
            <SelectWithIcon
              options={longOptions}
              value="1"
              placeholder="Select application"
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Narrow Container (180px)</h3>
          <div style={{ width: "180px" }}>
            <SelectWithIcon
              options={longOptions}
              value="1"
              placeholder="Select application"
            />
          </div>
        </div>
      </div>
    );
  },
};

export const InteractiveDemo: Story = {
  render: () => {
    const [selectedProvider, setSelectedProvider] = useState<string | number>("provider-1");
    const [selectedApp, setSelectedApp] = useState<string | number>("");

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Select Vault Provider</label>
          <SelectWithIcon
            options={optionsWithAvatars}
            value={selectedProvider}
            onSelect={setSelectedProvider}
            placeholder="Choose a vault provider"
          />
          {selectedProvider && (
            <p className="text-xs text-gray-500">
              Selected: {optionsWithAvatars.find(o => o.value === selectedProvider)?.label}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Select Application</label>
          <SelectWithIcon
            options={optionsWithColoredIcons}
            value={selectedApp}
            onSelect={setSelectedApp}
            placeholder="Choose an application"
          />
          {selectedApp && (
            <p className="text-xs text-gray-500">
              Selected: {optionsWithColoredIcons.find(o => o.value === selectedApp)?.label}
            </p>
          )}
        </div>
      </div>
    );
  },
};

export const ManyOptions: Story = {
  render: () => {
    const manyOptions: OptionWithIcon[] = Array.from({ length: 20 }, (_, i) => ({
      value: `provider-${i}`,
      label: `Vault Provider ${String.fromCharCode(65 + (i % 26))}${i > 25 ? Math.floor(i / 26) : ""}`,
      icon: (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-main text-sm font-semibold text-white">
          {String.fromCharCode(65 + (i % 26))}
        </div>
      ),
    }));

    return (
      <div className="w-96">
        <SelectWithIcon
          options={manyOptions}
          placeholder="Select from many providers"
          onSelect={console.log}
        />
      </div>
    );
  },
};

