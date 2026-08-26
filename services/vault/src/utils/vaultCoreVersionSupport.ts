/**
 * Fail-closed preflight for vault core (tx-graph) versions.
 *
 * The bundled WASM can only build the graph versions it ships with
 * (`supportedTxGraphVersions()`). A fresh deposit must be buildable at the
 * contract's `activeVaultCoreVersion`; a resumed vault must be buildable at
 * its stamped `vaultCoreVersion`. Checking up front — before any wallet
 * popup — turns a mid-flow WASM rejection into an actionable "update the
 * app" message.
 */

import { supportedTxGraphVersions } from "@babylonlabs-io/ts-sdk/tbv/core";

import { COPY } from "@/copy";

// The supported set is a compile-time constant of the shipped binary, so one
// successful read serves the whole session. A rejected init must NOT stick:
// clear the memo so a transient WASM-load failure can retry.
let supportedVersionsPromise: Promise<number[]> | null = null;

export function getSupportedVaultCoreVersions(): Promise<number[]> {
  supportedVersionsPromise ??= supportedTxGraphVersions().catch((err) => {
    supportedVersionsPromise = null;
    throw err;
  });
  return supportedVersionsPromise;
}

/**
 * Throw a user-facing error when this build's WASM cannot construct the
 * given vault core version. Call before any signing/broadcast work on a
 * version sourced from chain (fresh: active; resume: stamped).
 */
export async function assertVaultCoreVersionSupported(
  version: number,
): Promise<void> {
  const supported = await getSupportedVaultCoreVersions();
  if (!supported.includes(version)) {
    throw new Error(COPY.deposit.errors.appVersionUnsupported.body);
  }
}
