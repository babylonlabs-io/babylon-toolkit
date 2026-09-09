/**
 * E2E-ONLY Speculos transport bootstrap (#2110 full-dApp emulator E2E).
 *
 * When `NEXT_PUBLIC_TBV_E2E_SPECULOS_URL` is set, arms the ledger-vault-signer
 * transport seam ({@link setDmkTransportOverride}) with the Speculos HTTP
 * transport BEFORE the app renders, so the wallet's first connect — which
 * builds the DMK singleton and freezes its transport — can never race the
 * override. With the flag unset this module does nothing and imports nothing:
 * the two `@ledgerhq` test kits are reached only through the flag-guarded
 * dynamic imports below, keeping production bundles speculos-free.
 *
 * @module e2e/speculosTransportBootstrap
 */

import { setDmkTransportOverride } from "@babylonlabs-io/ledger-vault-signer";

import featureFlags from "@/config/featureFlags";

/**
 * `isE2E: true` skips SpeculosTransport's disconnect watcher — a 2 s
 * `setInterval` that `disconnect()` never clears (see the signer's
 * dmkTransport e2e) — and the container runs `--model nanosp`, so the factory
 * must not claim its STAX default.
 */
const SPECULOS_IS_E2E = true;

/**
 * No-op in production: returns `undefined` when the flag is unset, so the
 * caller's render path is byte-identical to a build without this module.
 * When set, resolves once the seam is armed; the caller must await it before
 * rendering anything that can reach a wallet connect.
 */
export function initSpeculosTransportForE2E(): Promise<void> | undefined {
  const speculosUrl = featureFlags.e2eSpeculosUrl;
  if (speculosUrl === undefined) return undefined;
  return armSpeculosTransport(speculosUrl);
}

async function armSpeculosTransport(speculosUrl: string): Promise<void> {
  const [{ speculosTransportFactory, speculosIdentifier }, { DeviceModelId }] =
    await Promise.all([
      import("@ledgerhq/device-transport-kit-speculos"),
      import("@ledgerhq/device-management-kit"),
    ]);
  setDmkTransportOverride({
    transportFactory: speculosTransportFactory(
      speculosUrl,
      SPECULOS_IS_E2E,
      DeviceModelId.NANO_SP,
    ),
    transportIdentifier: speculosIdentifier,
  });
}
