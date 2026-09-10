/**
 * E2E-ONLY Speculos transport bootstrap (#2110 full-dApp emulator E2E).
 *
 * When `NEXT_PUBLIC_TBV_E2E_SPECULOS_URL` is set in a DEV build, arms the
 * ledger-vault-signer transport seam ({@link setDmkTransportOverride}, from
 * the package's `./testing` subpath) with the Speculos HTTP transport BEFORE
 * the app renders, so the wallet's first connect — which builds the DMK
 * singleton and freezes its transport — can never race the override.
 *
 * Production containment is BUILD-TIME, not trust: the whole arm path sits
 * behind `import.meta.env.DEV`, which Vite folds to `false` in builds, so the
 * two `@ledgerhq` test kits are statically unreachable and emitted into no
 * production chunk. (The signer import below is static, but the signer
 * already ships in the app via the wallet-connector.)
 *
 * The URL must be plain-http `localhost`: the page CSP's `connect-src` admits
 * `http://localhost:*` but NOT `http://127.0.0.1:*` (host parts match
 * literally), so an IP loopback would arm successfully and then every APDU
 * fetch would be silently blocked. Rejecting anything else here turns that
 * silent hang — or an operator typo pointing hardware signing at a remote
 * host — into a loud boot error.
 *
 * @module e2e/speculosTransportBootstrap
 */

import { setDmkTransportOverride } from "@babylonlabs-io/ledger-vault-signer/testing";

import featureFlags from "@/config/featureFlags";

/**
 * `isE2E: true` skips SpeculosTransport's disconnect watcher — a 2 s
 * `setInterval` that `disconnect()` never clears (see the signer's
 * dmkTransport e2e) — and the container runs `--model nanosp`, so the factory
 * must not claim its STAX default.
 */
const SPECULOS_IS_E2E = true;

/** The one host the page CSP's `connect-src` carve-out admits for plain http. */
const SPECULOS_ALLOWED_HOSTNAME = "localhost";

let armed = false;

/**
 * Whether the Speculos override is actually in place (set only AFTER
 * {@link setDmkTransportOverride} returned). The wallet gate reads this at
 * render time — render strictly follows arming via `main.tsx` — so the
 * Ledger row can never open on a configured-but-unarmed transport.
 */
export function isSpeculosTransportArmed(): boolean {
  return armed;
}

/**
 * No-op outside DEV builds and when the flag is unset: returns `undefined`
 * synchronously, so the caller's render path is byte-identical to a build
 * without this module. When it returns a promise, the caller must await it
 * before rendering anything that can reach a wallet connect.
 */
export function initSpeculosTransportForE2E(): Promise<void> | undefined {
  if (!import.meta.env.DEV) return undefined;
  const speculosUrl = featureFlags.e2eSpeculosUrl;
  if (speculosUrl === undefined) return undefined;
  return armSpeculosTransport(speculosUrl);
}

/** See the module doc: CSP admits plain-http `localhost` only — e.g. `http://localhost:5055`. */
function assertAllowedSpeculosUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_TBV_E2E_SPECULOS_URL is not a URL: "${raw}"`);
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== SPECULOS_ALLOWED_HOSTNAME
  ) {
    throw new Error(
      `NEXT_PUBLIC_TBV_E2E_SPECULOS_URL must be http://${SPECULOS_ALLOWED_HOSTNAME}:<port> ` +
        `(the page CSP blocks other origins, including 127.0.0.1); got "${raw}"`,
    );
  }
  return raw;
}

async function armSpeculosTransport(rawUrl: string): Promise<void> {
  // Inside the async fn so a bad URL REJECTS (main.tsx's handler renders the
  // app with a diagnostic) instead of throwing through module evaluation.
  const speculosUrl = assertAllowedSpeculosUrl(rawUrl);
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
  armed = true;
}
