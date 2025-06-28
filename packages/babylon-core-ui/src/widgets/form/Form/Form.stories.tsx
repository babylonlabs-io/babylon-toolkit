import type { Meta, StoryObj } from "@storybook/react";
import * as yup from "yup";

import { Form } from "./Form";

import { useField } from "@/widgets/form/hooks";
import { Input, FormControl } from "@/components/Form";

const meta: Meta<typeof Form> = {
  component: Form,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

const Field = () => {
  const { error, invalid, ...inputProps } = useField({ name: "test", autoFocus: true, defaultValue: "test" });

  return (
    <FormControl label="Text field" state={invalid ? "error" : "default"} hint={error}>
      <Input {...inputProps} state={invalid ? "error" : "default"} />
    </FormControl>
  );
};

const schema = yup
  .object()
  .shape({
    test: yup.string().required(),
  })
  .required();

export const Default: Story = {
  args: {
    onChange: console.log,
    schema,
  },
  render: (props) => (
    <Form {...props}>
      <Field />
    </Form>
  ),
};
