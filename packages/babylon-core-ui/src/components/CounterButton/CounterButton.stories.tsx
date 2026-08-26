import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";

import { CounterButton } from "./CounterButton";

const meta: Meta<typeof CounterButton> = {
  title: "Components/Inputs/Actions/CounterButton",
  component: CounterButton,
  tags: ["autodocs"],
  args: {
    onAdd: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    counter: 0,
    max: 5,
  },
};

export const WithCounter: Story = {
  args: {
    counter: 2,
    max: 5,
  },
};

export const AlmostAtMax: Story = {
  args: {
    counter: 4,
    max: 5,
  },
};

export const AtMaxCapacity: Story = {
  args: {
    counter: 1,
    max: 1,
  },
};

export const AlwaysShowCounter: Story = {
  args: {
    counter: 0,
    max: 3,
    alwaysShowCounter: true,
  },
};