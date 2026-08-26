import type { Meta, StoryObj } from "@storybook/react";
import * as yup from "yup";

import { TextField } from "./TextField";
import { Form } from "@/widgets/form/Form";

const meta: Meta<typeof TextField> = {
  title: "Elements/Inputs/Controls/TextField",
  component: TextField,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof TextField>;

const schema = yup
  .object()
  .shape({
    text_field: yup.string().required(),
  })
  .required();

export const Default: Story = {
  args: {
    label: "Text Field",
    name: "text_field",
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
