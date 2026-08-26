import type { Meta, StoryObj } from "@storybook/react";

import { Form } from "@/widgets/form/Form";

import { CheckboxField } from "./CheckboxField";

const meta: Meta<typeof CheckboxField> = {
  title: "Elements/Inputs/Controls/CheckboxField",
  component: CheckboxField,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "checkbox_field",
    label: "Checkbox field",
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} defaultValues={{ checkbox_field: true }}>
        <Story />
      </Form>
    ),
  ],
};
