import type { Meta, StoryObj } from "@storybook/react";

import { ProvidersList } from "./ProvidersList";

const meta: Meta<typeof ProvidersList> = {
  component: ProvidersList,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const mockProviders = [
  {
    bsnId: "bsn123",
    bsnName: "Babylon",
    bsnLogoUrl: "/images/fps/pumpbtc.jpeg",
    provider: {
      logo_url: "/images/fps/lombard.jpeg",
      rank: 1,
      description: {
        moniker: "Lombard Protocol",
      },
    },
  },
  {
    bsnId: "bsn456",
    bsnName: "Babylon Chain",
    bsnLogoUrl: "/images/fps/solv.jpeg",
    provider: {
      logo_url: "/images/fps/pumpbtc.jpeg",
      rank: 2,
      description: {
        moniker: "PumpBTC Provider",
      },
    },
  },
  {
    bsnId: "bsn789",
    bsnName: "Babylon Network",
    bsnLogoUrl: undefined,
    provider: {
      logo_url: "/images/fps/solv.jpeg",
      rank: 3,
      description: {
        moniker: "Solv Protocol",
      },
    },
  },
];

export const Default: Story = {
  args: {
    items: mockProviders,
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const SingleProvider: Story = {
  args: {
    items: [mockProviders[0]],
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const EmptyList: Story = {
  args: {
    items: [],
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const WithoutLogos: Story = {
  args: {
    items: [
      {
        bsnId: "bsn111",
        bsnName: "Babylon",
        bsnLogoUrl: undefined,
        provider: {
          logo_url: undefined,
          rank: 1,
          description: {
            moniker: "Provider Without Logo",
          },
        },
      },
      {
        bsnId: "bsn222",
        bsnName: "Babylon Chain",
        bsnLogoUrl: undefined,
        provider: {
          logo_url: undefined,
          rank: 2,
          description: {
            moniker: "Another Provider",
          },
        },
      },
    ],
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};

export const MixedProviders: Story = {
  args: {
    items: [
      {
        bsnId: "bsn001",
        bsnName: "Babylon Premium",
        bsnLogoUrl: "/images/fps/lombard.jpeg",
        provider: {
          logo_url: "/images/fps/pumpbtc.jpeg",
          rank: 1,
          description: {
            moniker: "Top Ranked Provider",
          },
        },
      },
      {
        bsnId: "bsn002",
        bsnName: "Babylon Standard",
        bsnLogoUrl: undefined,
        provider: {
          logo_url: "/images/fps/solv.jpeg",
          rank: 15,
          description: {
            moniker: "Mid Tier Provider",
          },
        },
      },
      {
        bsnId: "bsn003",
        bsnName: "Babylon Basic",
        bsnLogoUrl: "/images/fps/pumpbtc.jpeg",
        provider: {
          logo_url: undefined,
          rank: 99,
          description: {
            moniker: "Basic Provider Service",
          },
        },
      },
    ],
    onRemove: (bsnId: string) => alert(`Remove clicked for ${bsnId}`),
  },
};
