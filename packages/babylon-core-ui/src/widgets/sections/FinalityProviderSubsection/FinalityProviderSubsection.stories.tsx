import type { Meta, StoryObj } from "@storybook/react";

import { FinalityProviderSubsection } from "./FinalityProviderSubsection";
import type { ProviderItem } from "../../../elements/ProvidersList/ProvidersList";

const sampleItems: ProviderItem[] = [
  {
    bsnId: "babylon",
    bsnName: "Babylon Genesis",
    bsnLogoUrl: "https://placehold.co/24x24?text=B",
    provider: {
      rank: 1,
      logo_url: "https://placehold.co/40x40",
      description: { moniker: "Provider 1" },
    },
  },
];

const multipleItems: ProviderItem[] = [
  {
    bsnId: "babylon",
    bsnName: "Babylon Genesis",
    bsnLogoUrl: "https://placehold.co/24x24?text=B",
    provider: {
      rank: 1,
      logo_url: "https://placehold.co/40x40",
      description: { moniker: "Babylon Provider" },
    },
  },
  {
    bsnId: "ethereum",
    bsnName: "Ethereum Bridge",
    bsnLogoUrl: "https://placehold.co/24x24?text=E",
    provider: {
      rank: 2,
      logo_url: "https://placehold.co/40x40",
      description: { moniker: "Ethereum Provider" },
    },
  },
];

const maxCapacityItems: ProviderItem[] = [
  {
    bsnId: "babylon",
    bsnName: "Babylon Genesis",
    bsnLogoUrl: "https://placehold.co/24x24?text=B",
    provider: {
      rank: 1,
      logo_url: "https://placehold.co/40x40",
      description: { moniker: "Babylon Provider" },
    },
  },
  {
    bsnId: "ethereum",
    bsnName: "Ethereum Bridge",
    bsnLogoUrl: "https://placehold.co/24x24?text=E",
    provider: {
      rank: 2,
      logo_url: "https://placehold.co/40x40",
      description: { moniker: "Ethereum Provider" },
    },
  },
  {
    bsnId: "polygon",
    bsnName: "Polygon Network",
    bsnLogoUrl: "https://placehold.co/24x24?text=P",
    provider: {
      rank: 3,
      logo_url: "https://placehold.co/40x40",
      description: { moniker: "Polygon Provider" },
    },
  },
];

const meta: Meta<typeof FinalityProviderSubsection> = {
  title: "Widgets/Staking/FinalityProviderSubsection",
  component: FinalityProviderSubsection,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    max: 3,
    items: sampleItems,
    actionText: "Add BSN and Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: () => alert("Remove clicked"),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const Empty: Story = {
  args: {
    max: 3,
    items: [],
    actionText: "Add BSN and Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: () => alert("Remove clicked"),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const MultipleItems: Story = {
  args: {
    max: 5,
    items: multipleItems,
    actionText: "Add BSN and Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: (bsnId?: string) => alert(`Remove clicked for ${bsnId}`),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const AtMaximumCapacity: Story = {
  args: {
    max: 3,
    items: maxCapacityItems,
    actionText: "Add BSN and Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: (bsnId?: string) => alert(`Remove clicked for ${bsnId}`),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const SingleProviderMode: Story = {
  args: {
    max: 1,
    items: [],
    actionText: "Add Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: () => alert("Remove clicked"),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const SingleProviderModeWithItem: Story = {
  args: {
    max: 1,
    items: [sampleItems[0]],
    actionText: "Add Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: (bsnId?: string) => alert(`Remove clicked for ${bsnId}`),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const ProvidersWithoutLogos: Story = {
  args: {
    max: 3,
    items: [
      {
        bsnId: "nologo1",
        bsnName: "Provider Without Logo",
        provider: {
          rank: 1,
          description: { moniker: "No Logo Provider" },
        },
      },
      {
        bsnId: "nologo2",
        bsnName: "Another Provider",
        bsnLogoUrl: "https://placehold.co/24x24?text=A",
        provider: {
          rank: 2,
          description: { moniker: "Provider with BSN logo only" },
        },
      },
    ],
    actionText: "Add BSN and Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: (bsnId?: string) => alert(`Remove clicked for ${bsnId}`),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const ProvidersWithoutDescriptions: Story = {
  args: {
    max: 3,
    items: [
      {
        bsnId: "nodesc1",
        bsnName: "Provider Without Description",
        bsnLogoUrl: "https://placehold.co/24x24?text=N",
        provider: {
          rank: 1,
          logo_url: "https://placehold.co/40x40",
        },
      },
      {
        bsnId: "nodesc2",
        bsnName: "Another Provider",
        bsnLogoUrl: "https://placehold.co/24x24?text=A",
        provider: {
          rank: 2,
          logo_url: "https://placehold.co/40x40",
          description: {},
        },
      },
    ],
    actionText: "Add BSN and Finality Provider",
    onAdd: () => alert("Add clicked"),
    onRemove: (bsnId?: string) => alert(`Remove clicked for ${bsnId}`),
  },
  render: ({ max, items, actionText, onAdd, onRemove }) => (
    <FinalityProviderSubsection max={max} items={items} actionText={actionText} onAdd={onAdd} onRemove={onRemove} />
  ),
};

export const SingleProviderWithoutBsnLogo: Story = {
  args: {
    max: 1,
    items: [
      {
        bsnId: "babylon",
        bsnName: "Babylon Genesis",
        provider: {
          rank: 1,
          logo_url: "https://placehold.co/40x40",
          description: { moniker: "Babylon Provider" },
        },
      },
    ],
    actionText: "Select Validator",
    onAdd: () => alert("Add clicked"),
    onRemove: (bsnId?: string) => alert(`Remove clicked for ${bsnId}`),
    showChain: false,
  },
  render: ({ max, items, actionText, onAdd, onRemove, showChain }) => (
    <FinalityProviderSubsection
      max={max}
      items={items}
      actionText={actionText}
      onAdd={onAdd}
      onRemove={onRemove}
      showChain={showChain}
    />
  ),
};
