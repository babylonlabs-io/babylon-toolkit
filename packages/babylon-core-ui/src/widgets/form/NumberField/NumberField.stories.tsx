import type { Meta, StoryObj } from "@storybook/react";
import * as yup from "yup";

import { NumberField } from "./NumberField";
import { Form } from "@/widgets/form/Form";

const meta: Meta<typeof NumberField> = {
  component: NumberField,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof NumberField>;

const schema = yup
  .object()
  .shape({
    number_field: yup
      .number()
      .transform((value) => (Number.isNaN(value) ? null : value))
      .required(),
  })
  .required();

export const Default: Story = {
  args: {
    label: "Number Field",
    name: "number_field",
    placeholder: "Default input",
    hint: "Some random and useless hint",
    defaultValue: "",
    autoFocus: true,
  },
  decorators: [
    (Story) => (
      <Form schema={schema} onChange={console.log}>
        <Story />
      </Form>
    ),
  ],
};
