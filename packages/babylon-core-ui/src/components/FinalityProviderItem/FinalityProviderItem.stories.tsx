import type { Meta, StoryObj } from "@storybook/react";

import { FinalityProviderItem } from "./FinalityProviderItem";

const meta: Meta<typeof FinalityProviderItem> = {
  component: FinalityProviderItem,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const mockProvider = {
  logo_url: "/images/fps/lombard.jpeg",
  rank: 1,
  description: {
    moniker: "Lombard Protocol",
  },
};

const mockProviderWithoutLogo = {
  logo_url: undefined,
  rank: 5,
  description: {
    moniker: "Bitcoin Staking Provider",
  },
};

export const Default: Story = {
  args: {
    bsnId: "bsn123",
    bsnName: "Babylon",
    bsnLogoUrl: "/images/fps/pumpbtc.jpeg",
    provider: mockProvider,
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const WithoutBsnLogo: Story = {
  args: {
    bsnId: "bsn456",
    bsnName: "Babylon Chain",
    bsnLogoUrl: undefined,
    provider: mockProvider,
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const WithoutProviderLogo: Story = {
  args: {
    bsnId: "bsn789",
    bsnName: "Babylon Network",
    bsnLogoUrl: "/images/fps/solv.jpeg",
    provider: mockProviderWithoutLogo,
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const HighRankProvider: Story = {
  args: {
    bsnId: "bsn999",
    bsnName: "Babylon Testnet",
    bsnLogoUrl: "/images/fps/pumpbtc.jpeg",
    provider: {
      logo_url: "/images/fps/solv.jpeg",
      rank: 99,
      description: {
        moniker: "High Rank Provider",
      },
    },
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const LongNames: Story = {
  args: {
    bsnId: "bsn_very_long_id_123456789",
    bsnName: "Very Long Babylon Network Name That Might Wrap",
    bsnLogoUrl: "/images/fps/lombard.jpeg",
    provider: {
      logo_url: "/images/fps/pumpbtc.jpeg",
      rank: 42,
      description: {
        moniker: "Very Long Finality Provider Name That Should Handle Text Overflow",
      },
    },
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};
