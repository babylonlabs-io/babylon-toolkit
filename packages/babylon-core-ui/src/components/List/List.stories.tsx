import type { Meta, StoryObj } from "@storybook/react";
import { MdOutlineInfo } from "react-icons/md";

import { List } from "./List";
import { ListItem } from "./components/ListItem";

const meta: Meta<typeof List> = {
  component: List,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    orientation: "horizontal",
    children: [
      <ListItem title="Signet Bitcoin Balance" value="100.123456 sBTC" />,
      <ListItem title="Signet Bitcoin Balance" value="100.123456 sBTC" />,
      <ListItem title="Signet Bitcoin Balance" value="100.123456 sBTC" suffix={<MdOutlineInfo size={24} />} />,
    ],
  },
};
