#!/usr/bin/env -S pnpm exec tsx

/** CI pre-build gate: the matrix's profile must exist, validate, and have the expected kind. */

import { PROFILE_KINDS, type ProfileKind } from "../src/config/network/profile";
import { readResolvedNetworkProfile } from "./lib/networkProfiles";

const [name, kindFlag, expectedKind] = process.argv.slice(2);
if (
  !name ||
  kindFlag !== "--kind" ||
  !(PROFILE_KINDS as readonly string[]).includes(expectedKind ?? "")
) {
  console.error(
    `usage: check-network-profile.ts <name> --kind ${PROFILE_KINDS.join("|")}`,
  );
  process.exit(1);
}

const profile = readResolvedNetworkProfile(name);
if (profile.kind !== (expectedKind as ProfileKind)) {
  console.error(
    `check-network-profile: networks/${name}.json has kind "${profile.kind}" but the matrix expects "${expectedKind}".`,
  );
  process.exit(1);
}
console.log(
  `check-network-profile: ${name} (kind ${profile.kind}, btc ${profile.btcNetwork}, eth ${profile.ethChainId}, registry ${profile.contracts.btcVaultRegistry}, from ${profile.registryCommit ?? "hand-written"})`,
);
