import type { Meta, StoryObj } from "@storybook/react";

import logo from "@/core/wallets/btc/ledger-vault/logo.svg";
import { MONOCHROME_MARK_BACKGROUND } from "@/core/wallets/constants";

import { ConnectGuide } from "./index";

const meta: Meta<typeof ConnectGuide> = {
  component: ConnectGuide,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Ledger Vault",
    logo,
    logoBackground: MONOCHROME_MARK_BACKGROUND,
    guide: {
      steps: [
        "Plug in your Ledger and unlock it with your PIN.",
        "Open the Babylon Vault Testnet app on your Ledger.",
        "Close Ledger Wallet (formerly Ledger Live) if it is open. It can take over the connection to your Ledger.",
        "Select Connect. If your browser asks, choose your Ledger.",
      ],
      installSteps: [
        "In Ledger Wallet, open Settings → Experimental features. Turn on My Ledger provider and set it to 4.",
        "Go to My Ledger and install the Babylon Vault Testnet app.",
        "Then close Ledger Wallet and follow the steps at the top.",
      ],
    },
    onConnect: () => console.log("connect"),
  },
};
