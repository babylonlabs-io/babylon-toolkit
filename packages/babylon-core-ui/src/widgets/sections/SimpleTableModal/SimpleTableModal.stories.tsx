import type { Meta, StoryObj } from "@storybook/react";

import { SimpleTableModal } from "./SimpleTableModal";

const meta: Meta<typeof SimpleTableModal> = {
  title: "Widgets/Modals/SimpleTableModal",
  component: SimpleTableModal,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

const data = [
  {
    name: "Lombard",
    logo_url: "/images/fps/lombard.jpeg",
    bsnId: "babylon",
    bsnLogoUrl: "/images/babylon.jpeg",
  },
  {
    name: "Lorezno",
    logo_url: "/images/fps/solv.jpeg",
    bsnId: "sui",
    bsnLogoUrl: "/images/sui.jpeg",
  },
  {
    name: "Lorezno",
    logo_url: "/images/fps/pumpbtc.jpeg",
    bsnId: "sui",
    bsnLogoUrl: "/images/sui.jpeg",
  },
];

export const Default: Story = {
  args: {
    headers: ["BSNs", "Finality Providers"],
    data: data
  },
};

export const LongData: Story = {
  args: {
    headers: ["BSNs", "Finality Providers"],
    data: [...Array(100)].map((_, i) => ({ ...data[i % data.length] })),
  },
};
