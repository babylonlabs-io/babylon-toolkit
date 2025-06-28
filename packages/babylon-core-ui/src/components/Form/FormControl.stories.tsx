import type { Meta, StoryObj } from "@storybook/react";

import { FormControl } from "./FormControl";
import { Input } from "./Input";

const meta: Meta<typeof FormControl> = {
  component: FormControl,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof FormControl>;

export const Default: Story = {
  args: {
    label: "Label",
    children: <Input defaultValue="Hello" />,
    hint: "Some random hint",
  },
};

export const WithoutLabel: Story = {
  args: {
    children: <Input defaultValue="Hello Error" state="error" />,
    hint: "Some random error",
    state: "error",
  },
};

export const WithError: Story = {
  args: {
    label: "Label",
    children: <Input defaultValue="Hello Error" state="error" />,
    hint: "Some random error",
    state: "error",
  },
};
