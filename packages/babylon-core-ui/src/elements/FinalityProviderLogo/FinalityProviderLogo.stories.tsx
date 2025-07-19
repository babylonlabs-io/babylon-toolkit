import type { Meta, StoryObj } from "@storybook/react";

import { FinalityProviderLogo } from "./FinalityProviderLogo";

const meta: Meta<typeof FinalityProviderLogo> = {
  component: FinalityProviderLogo,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const WithImage: Story = {
  args: {
    logoUrl: "/images/fps/lombard.jpeg",
    rank: 1,
    moniker: "Lombard Protocol",
  },
};

export const WithImageLarge: Story = {
  args: {
    logoUrl: "/images/fps/pumpbtc.jpeg",
    rank: 2,
    moniker: "PumpBTC",
    size: "lg",
  },
};

export const WithImageSmall: Story = {
  args: {
    logoUrl: "/images/fps/solv.jpeg",
    rank: 3,
    moniker: "Solv Protocol",
    size: "sm",
  },
};

export const FallbackWithMoniker: Story = {
  args: {
    rank: 1,
    moniker: "Babylon Network",
  },
};

export const FallbackWithoutMoniker: Story = {
  args: {
    rank: 5,
  },
};

export const FallbackLarge: Story = {
  args: {
    rank: 2,
    moniker: "Large Provider",
    size: "lg",
  },
};

export const FallbackSmall: Story = {
  args: {
    rank: 3,
    moniker: "Small Provider",
    size: "sm",
  },
};

export const InvalidImage: Story = {
  args: {
    logoUrl: "/invalid-image-url.jpg",
    rank: 4,
    moniker: "Provider with Invalid Image",
  },
};
