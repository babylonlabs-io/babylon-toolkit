import type { Meta, StoryObj } from "@storybook/react";

import { Form } from "@/widgets/form/Form";

import { RadioField } from "./RadioField";

const meta: Meta<typeof RadioField> = {
  title: "Elements/Inputs/Controls/RadioField",
  component: RadioField,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <Form onChange={console.log}>
        <Story />
      </Form>
    ),
  ],
  render: () => (
    <div className="flex flex-col gap-4">
      <RadioField name="radio_filed" value="test" label="Test" />
      <RadioField defaultChecked name="radio_filed" value="test1" label="Test 1" />
      <RadioField name="radio_filed" value="test2" label="Test 2" />
    </div>
  ),
};
