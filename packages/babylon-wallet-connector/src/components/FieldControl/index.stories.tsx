import { Checkbox, Radio } from "@babylonlabs-io/core-ui";
import type { Meta, StoryObj } from "@storybook/react";

import { FieldControl } from "./index";

const meta: Meta<typeof FieldControl> = {
  component: FieldControl,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const CheckboxFiled: Story = {
  args: {
    label:
      "I acknowledge that Keystone via QR code is the only hardware wallet supporting Bitcoin Staking. Using any other hardware wallets through any means (such as connection to software / extension / mobile wallet) can lead to permanent inability to withdraw the stake.",
    children: <Checkbox />,
  },
};

export const RadioFiled: Story = {
  args: {
    label:
      "I acknowledge that Keystone via QR code is the only hardware wallet supporting Bitcoin Staking. Using any other hardware wallets through any means (such as connection to software / extension / mobile wallet) can lead to permanent inability to withdraw the stake.",
    children: <Radio />,
  },
};
