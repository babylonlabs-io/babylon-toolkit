import type { DelegatedClaimVaultContext } from "@babylonlabs-io/ts-sdk/tbv/core";

/**
 * The pinned WASM requires a babe_sessions entry for every challenger of the
 * graph to assemble and to verify (btc-vault delegated_claim.rs:454-497 @
 * ac4954e7), and the real sessions never enter the page. This marker
 * satisfies coverage; scripts/join-babe-sessions.mjs replaces exactly this
 * shape with the bundle's sessions (#2598 tracks the upstream fix). Mirrored
 * there as PLACEHOLDER_DECRYPTOR_ARTIFACTS_HEX.
 */
const PLACEHOLDER_DECRYPTOR_ARTIFACTS_HEX = "00";

export function placeholderBabeSessionsJson(
  vault: Pick<
    DelegatedClaimVaultContext,
    "vaultKeeperBtcPubkeys" | "universalChallengerBtcPubkeys"
  >,
): string {
  // The planner asserts the graph's challenger set equals local ∪ universal.
  const challengers = [
    ...vault.vaultKeeperBtcPubkeys,
    ...vault.universalChallengerBtcPubkeys,
  ];
  return JSON.stringify(
    Object.fromEntries(
      challengers.map((pk) => [
        pk,
        { decryptor_artifacts_hex: PLACEHOLDER_DECRYPTOR_ARTIFACTS_HEX },
      ]),
    ),
  );
}
