import type { Meta, StoryObj } from "@storybook/react";

import { Form } from "@/widgets/form/Form";

import { HiddenField } from "./HiddenField";

const meta: Meta<typeof HiddenField> = {
  component: HiddenField,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "hidden_field",
    defaultValue: "test",
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log}>
        <Story />
      </Form>
    ),
  ],
};
