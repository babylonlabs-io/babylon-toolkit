import type { Meta, StoryObj } from "@storybook/react";

import { Text } from "./Text";

const meta: Meta<typeof Text> = {
  title: "Components/Data Display/Typography/Text",
  component: Text,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) =>
    args.variant ? (
      <Text {...args}>Text--{args.variant}</Text>
    ) : (
      <div className="text-accent-secondary">
        <Text {...args} variant="body1" className="my-4">
          Text--Body1
        </Text>
        <Text {...args} variant="body2" className="my-4">
          Text--Body2
        </Text>
        <Text {...args} variant="subtitle1" className="my-4">
          Text--subtitle1
        </Text>
        <Text {...args} variant="subtitle2" className="my-4">
          Text--subtitle2
        </Text>
        <Text {...args} variant="overline" className="my-4">
          Text--overline
        </Text>
        <Text {...args} variant="caption" className="my-4">
          Text--caption
        </Text>
      </div>
    ),
};
