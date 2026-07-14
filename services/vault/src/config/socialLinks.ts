/**
 * Shared social link URLs, so the page footer (v2 + mobile-v3) and the v3
 * sidebar's own social block can't drift on a handle/URL change. Icons and
 * per-surface presentation stay local to each caller — only the name+URL
 * pairs are shared here.
 */
export const SOCIAL_LINK_URLS = {
  github: "https://github.com/babylonlabs-io",
  // Matches the org convention used elsewhere (countdown, tbv-faucet,
  // coming-soon) — babylonlabs_io is an unrelated ~200-subscriber channel.
  telegram: "https://t.me/babyloncommunity",
  linkedin: "https://www.linkedin.com/company/babylon-labs-official",
  email: "mailto:contact@babylonlabs.io",
  discord: "https://discord.gg/babylonglobal",
  x: "https://x.com/babylonlabs_io",
} as const;
