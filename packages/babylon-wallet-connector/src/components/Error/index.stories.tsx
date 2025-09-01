import type { Meta, StoryObj } from "@storybook/react";

import { Error } from "./index";

const meta: Meta<typeof Error> = {
  component: Error,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52" fill="none">
        <path
          d="M2.16675 46.5837H49.8334L26.0001 5.41699L2.16675 46.5837ZM28.1667 40.0837H23.8334V35.7503H28.1667V40.0837ZM28.1667 31.417H23.8334V22.7503H28.1667V31.417Z"
          fill="#387085"
        />
      </svg>
    ),
    title: "Public Key Mismatch",
    description:
      "The Bitcoin address and Public Key for this wallet do not match. Please contact your wallet provider for support.",
    onCancel: () => console.log("cancel"),
    onSubmit: () => console.log("submit"),
  },
};
