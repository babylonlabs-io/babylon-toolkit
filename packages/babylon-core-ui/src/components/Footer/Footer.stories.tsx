import type { Meta, StoryObj } from "@storybook/react";
import { BsDiscord, BsGithub } from "react-icons/bs";
import { FaXTwitter } from "react-icons/fa6";

import { DEFAULT_SOCIAL_LINKS, Footer } from "./Footer";

const meta: Meta<typeof Footer> = {
  title: "Components/Footer",
  component: Footer,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Footer>;

export const Default: Story = {
  args: {
    socialLinks: DEFAULT_SOCIAL_LINKS,
    copyrightYear: 2025,
  },
};

export const WithCustomYear: Story = {
  args: {
    socialLinks: DEFAULT_SOCIAL_LINKS,
    copyrightYear: 2024,
  },
};

export const WithCustomLinks: Story = {
  args: {
    socialLinks: [
      {
        name: "Twitter",
        url: "https://x.com/babylonlabs_io",
        Icon: FaXTwitter,
      },
      {
        name: "Discord",
        url: "https://discord.gg/babylonlabs",
        Icon: BsDiscord,
      },
      {
        name: "GitHub",
        url: "https://github.com/babylonlabs-io",
        Icon: BsGithub,
      },
    ],
    copyrightYear: 2025,
  },
};

