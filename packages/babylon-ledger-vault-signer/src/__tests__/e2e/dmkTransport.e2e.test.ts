/**
 * DMK-transport end-to-end test: the production {@link connectDmkSession} path
 * — discovery, connect with the refresher disabled, and the
 * GET_APP_AND_VERSION preflight — driven over a REAL DMK transport instead of
 * the unit suite's mocked one. The sibling `speculos.e2e.test.ts` speaks to
 * Speculos over its REST API directly and never exercises DMK; this file is
 * the only coverage of the transport seam actually carrying APDUs.
 *
 * Runs against the same container as that suite, and is skipped unless
 * SPECULOS_URL is set:
 *
 *   SPECULOS_URL=http://127.0.0.1:5055 pnpm exec vitest run src/__tests__/e2e/
 *
 * That container is a single device holding one ceremony session, so this file
 * must never run alongside `speculos.e2e.test.ts` — vitest.config.ts drops
 * `fileParallelism` whenever SPECULOS_URL is set, which is what keeps them apart.
 *
 * @module ledger-vault-signer/__tests__/e2e/dmkTransport.e2e.test
 */

import { DeviceModelId } from "@ledgerhq/device-management-kit";
import { speculosIdentifier, speculosTransportFactory } from "@ledgerhq/device-transport-kit-speculos";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDmk, connectDmkSession, disconnectDmkSession, setDmkTransportOverride } from "../../dmkSession";

const SPECULOS_URL = process.env.SPECULOS_URL ?? "";

/**
 * `isE2E` skips SpeculosTransport's disconnect watcher — a 2 s `setInterval`
 * that `disconnect()` never clears, only a failed `sendApdu` does
 * (SpeculosTransport.js `listenForDisconnect`), so it would outlive the suite.
 */
const SPECULOS_IS_E2E = true;
/** The container runs `speculos.py --model nanosp`; the factory would otherwise claim STAX. */
const SPECULOS_DEVICE_MODEL = DeviceModelId.NANO_SP;

/** Discovery + connect + one preflight APDU over HTTP. */
const CONNECT_TIMEOUT_MS = 30_000;

describe.skipIf(SPECULOS_URL === "")("DMK session over the Speculos transport", () => {
  // Per-test, not per-file: the setter refuses while a DMK exists, so a second
  // `it` sharing one armed override would fail as if the seam were broken.
  beforeEach(() => {
    setDmkTransportOverride({
      transportFactory: speculosTransportFactory(SPECULOS_URL, SPECULOS_IS_E2E, SPECULOS_DEVICE_MODEL),
      transportIdentifier: speculosIdentifier,
    });
  });

  afterEach(() => {
    // Release this file's live HTTP-backed DMK; close first, since the setter
    // refuses to clear while one is built.
    closeDmk();
    setDmkTransportOverride(undefined);
  });

  it(
    "discovers, connects, and reports the running vault app from the connect preflight",
    async () => {
      const handle = await connectDmkSession();

      expect(handle.sessionId.length).toBeGreaterThan(0);
      // Same preflight the sibling suite reads over REST, here proving the DMK
      // command path — transport framing included — reaches the vault app.
      expect(handle.appName).toContain("Babylon Vault");
      expect(handle.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
      console.log(`[dmk-transport-e2e] app: ${handle.appName} v${handle.appVersion}`);

      await disconnectDmkSession(handle);
    },
    CONNECT_TIMEOUT_MS,
  );
});
