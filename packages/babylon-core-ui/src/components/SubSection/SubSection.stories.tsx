import type { Meta, StoryObj } from "@storybook/react";

import { SubSection } from "./SubSection";
import { Text } from "../Text";

const meta: Meta<typeof SubSection> = {
  title: "Components/Containers/Panels/SubSection",
  component: SubSection,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <Text>Lorem ipsum dolor sit amet</Text>,
  },
};
