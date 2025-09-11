import type { Meta, StoryObj } from "@storybook/react";
import * as yup from "yup";

import { SelectField } from "./SelectField";
import { Form } from "../Form";

const meta: Meta<typeof SelectField> = {
  title: "Elements/Inputs/Controls/SelectField",
  component: SelectField,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof SelectField>;

const schema = yup
  .object()
  .shape({
    select_field: yup.string().required(),
  })
  .required();

export const Default: Story = {
  args: {
    label: "Select Field",
    name: "select_field",
    placeholder: "Select value",
    hint: "Some random and useless hint",
    defaultValue: "pending",
    options: [
      { value: "", label: "None" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "pending", label: "Pending" },
    ],
  },
  decorators: [
    (Story) => (
      <Form schema={schema} onChange={console.log}>
        <Story />
      </Form>
    ),
  ],
};
