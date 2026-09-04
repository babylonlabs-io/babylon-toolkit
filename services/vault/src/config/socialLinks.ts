import {
  DiscordIcon,
  LinkedinIcon,
  MailIcon,
  TelegramIcon,
  XIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";

interface SocialLink {
  name: string;
  url: string;
  Icon: ComponentType<{ size?: number; className?: string; title?: string }>;
}

/**
 * Figma's Social Links block, minus the GitHub link, in Figma's icon order —
 * shared so the page footer (v2 + mobile-v3) and the v3 sidebar's own social
 * block can't drift on a handle, URL or ordering change. Per-surface
 * presentation (icon size, hover color) stays local to each caller.
 */
export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: "Telegram",
    // Matches the org convention used elsewhere (countdown, tbv-faucet,
    // coming-soon) — babylonlabs_io is an unrelated ~200-subscriber channel.
    url: "https://t.me/babylonofficialcommunity",
    Icon: TelegramIcon,
  },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/company/babylon-labs-official",
    Icon: LinkedinIcon,
  },
  { name: "Email", url: "mailto:contact@babylonlabs.io", Icon: MailIcon },
  {
    name: "Discord",
    url: "https://discord.gg/babylonglobal",
    Icon: DiscordIcon,
  },
  { name: "X", url: "https://x.com/babylonlabs_io", Icon: XIcon },
];

/**
 * Legal page URLs, shared for the same reason as the social links above: the
 * vault renders this pair in both the entry footer and the sidebar's own
 * footer, and they must not drift apart.
 */
export const LEGAL_LINK_URLS = {
  termsOfUse: "https://babylonlabs.io/terms-of-use",
  privacyPolicy: "https://babylonlabs.io/privacy-policy",
} as const;
