/**
 * Real deployment addresses for tests that need the app to recognise them:
 * the hubs it labels and the tokens in `src/services/token/tokenService.ts`.
 * Tests import them from here rather than copying them, so a redeploy changes
 * the profile and the token table, not every test.
 *
 * A test that only needs some address should use an obviously fake one
 * (`0x000…0003`) instead, and never needs to change on a redeploy.
 */
import { getAddress, type Address } from "viem";

import { parseNetworkProfile, type HubRole } from "@/config/network/profile";

/**
 * The hub the test run's profile lists in `role`: vitest.config.ts inlines
 * networks/e2e-replay.json, the profile the app under test labels hubs from.
 */
function profileHub(role: HubRole): Address {
  const raw = import.meta.env.TBV_NETWORK_PROFILE;
  if (!raw) {
    throw new Error(
      "TBV_NETWORK_PROFILE is unset; vitest.config.ts inlines the e2e-replay profile",
    );
  }
  const hub = parseNetworkProfile(JSON.parse(raw)).contracts[role];
  if (hub === undefined) {
    throw new Error(`The test profile lists no contracts.${role}`);
  }
  return getAddress(hub);
}

/** The hub the app labels "Babylon Hub" (the profile's `aaveHub`). */
export const BABYLON_HUB = profileHub("aaveHub");
/** The hub the app labels "Core Hub" (the profile's `aaveHubStables`). */
export const CORE_HUB = profileHub("aaveHubStables");

// Tokens: entries of TOKEN_REGISTRY. Several entries share a symbol (USDC is
// listed for mainnet, the Sepolia mock and Vault Devnet), so these are copied,
// not looked up by symbol.

/** Vault Devnet and testnet USDC. */
export const USDC: Address = "0xB588C1bd8A6cd3F114A52a0AD916778B419ECf48";
/** Vault Devnet and testnet WBTC. */
export const WBTC: Address = "0x504579d0424B7B7cB4b17e16626f6A2f67bCa054";
/** USDG, listed in TOKEN_REGISTRY from the 2026-09 Vault Devnet deploy. */
export const USDG: Address = "0x18d2048734d66cDB6468A93A3311feC9af037Cc4";
