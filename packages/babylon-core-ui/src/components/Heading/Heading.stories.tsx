import type { Meta, StoryObj } from "@storybook/react";

import { Heading } from "./Heading";

const meta: Meta<typeof Heading> = {
  component: Heading,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) =>
    args.variant ? (
      <Heading variant={args.variant} {...args}>Heading--{args.variant}</Heading>
    ) : (
      <div className="text-accent-primary">
        <Heading {...args} variant="h1">
          Heading--H1
        </Heading>
        <Heading {...args} variant="h2">
          Heading--H2
        </Heading>
        <Heading {...args} variant="h3">
          Heading--H3
        </Heading>
        <Heading {...args} variant="h4">
          Heading--H4
        </Heading>
        <Heading {...args} variant="h5">
          Heading--H5
        </Heading>
        <Heading {...args} variant="h6">
          Heading--H6
        </Heading>
      </div>
    ),
};
