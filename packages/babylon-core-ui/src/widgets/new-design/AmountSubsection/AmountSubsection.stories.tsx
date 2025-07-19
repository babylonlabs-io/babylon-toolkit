import type { Meta, StoryObj } from "@storybook/react";
import * as yup from "yup";

import { AmountSubsection } from "./AmountSubsection";
import { Form } from "@/widgets/form/Form";

const meta: Meta<typeof AmountSubsection> = {
  component: AmountSubsection,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

// Define a simple validation schema for the field used in this story
const schema = yup
  .object()
  .shape({
    amount: yup.number().required().positive(),
  })
  .required();

export const Default: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40",
    currencyName: "BBN",
    placeholder: "Enter Amount",
    displayBalance: true,
    balanceDetails: {
      balance: 1234.56789,
      symbol: "BBN",
      price: 0.25,
      displayUSD: true,
      decimals: 8,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};
