/**
 * DMK session lifecycle: discovery → connect → state gate → dispose behind a
 * Promise API, so everything above this file is device-free and testable.
 * Verified against the installed DMK 1.7.1 types, not the published docs.
 * The transport is web-hid, swappable pre-build through the test-only
 * {@link setDmkTransportOverride} seam.
 *
 * @module ledger-vault-signer/dmkSession
 */

import type {
  DeviceManagementKit,
  DeviceSessionId,
  DiscoveredDevice,
  TransportFactory,
  TransportIdentifier,
} from "@ledgerhq/device-management-kit";

/**
 * The refresher injects `GET_APP_AND_VERSION` mid-ceremony, and whether that
 * nullifies a loaded intent is unconfirmed (#2110) — so it stays off for the
 * whole session. (DMK does offer a scoped `disableDeviceSessionRefresher`
 * window; deliberately not used until nullification is understood.)
 */
const SESSION_REFRESHER_OPTIONS = { isRefresherDisabled: true } as const;

export interface DmkSessionHandle {
  readonly dmk: DeviceManagementKit;
  readonly sessionId: DeviceSessionId;
  /**
   * App name/version at connect time ("BOLOS" = dashboard). Diagnostic only;
   * absent when the preflight failed. Never re-read between intent phases.
   */
  readonly appName?: string;
  readonly appVersion?: string;
}

/**
 * One DMK per application, as a module-level lazy singleton (the connector is
 * not a React tree here). Two USED instances would each construct a transport,
 * duplicating its listener pair — and DMK never destroys one.
 */
let dmkInstance: DeviceManagementKit | undefined;
let dmkPromise: Promise<DmkBuild> | undefined;

/** A DMK paired with the transport identifier its OWN build registered. */
interface DmkBuild {
  readonly dmk: DeviceManagementKit;
  readonly transportIdentifier: TransportIdentifier;
}

/** Transport pair injected in place of the web-hid default. Test/E2E only. */
export interface DmkTransportOverride {
  readonly transportFactory: TransportFactory;
  /** Must match what the factory's transport reports via `getIdentifier()`. */
  readonly transportIdentifier: TransportIdentifier;
}

let transportOverride: DmkTransportOverride | undefined;

/**
 * TEST/E2E SEAM — replace the web-hid transport before the DMK is built. For
 * Speculos, pass `speculosTransportFactory(url)` + `speculosIdentifier` from
 * `@ledgerhq/device-transport-kit-speculos` (LedgerHQ/device-sdk-ts, tag
 * `@ledgerhq/device-transport-kit-speculos@1.2.1`, api/SpeculosTransport.ts).
 * The injector passes the factory in; this module never imports that package,
 * so production bundles stay speculos-free.
 *
 * Package-internal for now: deliberately NOT re-exported from `index.ts`, so
 * the only callers are this package's own tests. The env-gated dApp seam that
 * needs it publicly is a separate task and re-exports it with its consumer.
 *
 * The override persists across {@link closeDmk}; pass `undefined` to restore
 * the web-hid default.
 *
 * @throws while a DMK singleton exists (built or building): each build captures
 * the factory it was given, so a late swap would leave discovery pointed at a
 * transport that DMK does not hold. Call {@link closeDmk} first.
 */
export function setDmkTransportOverride(override: DmkTransportOverride | undefined): void {
  if (dmkPromise !== undefined) {
    throw new Error("setDmkTransportOverride: DMK already built or building — closeDmk() before changing transports");
  }
  transportOverride = override;
}

/**
 * Build (or reuse) the DMK instance. Memoised as a PROMISE, not the instance:
 * a check-then-act across the dynamic imports would let two concurrent connects
 * build two DMKs, and once both were USED each would hold its own transport and
 * listener pair, with no way to destroy either. A failed build clears the memo
 * (identity-guarded) so the next connect retries. Each build snapshots its
 * transport and resolves the identifier alongside the DMK; one abandoned
 * mid-flight by {@link closeDmk} rejects its callers, leaving its never-used
 * instance to be garbage-collected unclosed (see {@link publish}).
 *
 * Every `@ledgerhq/device-*` import is dynamic so a provider that ships
 * disabled stays off the bundle's critical path — DMK pulls in xstate,
 * inversify, reflect-metadata and purify-ts.
 */
function getDmk(): Promise<DmkBuild> {
  if (!dmkPromise) {
    // ONE read of the override per build: closeDmk() lifts the setter's guard,
    // so a swap can land while this build is suspended on its imports.
    const override = transportOverride;

    /**
     * Adopt as the singleton — or, if closeDmk() got here first, fail this
     * build's callers. Deliberately NOT closed: `build()` only stores the
     * factory, and DMK constructs transports when a use case first resolves
     * TransportService — so `close()` would CONSTRUCT this orphan's transport
     * (registering a WebHID listener pair) and then release nothing, since
     * `CloseSessionsUseCase` only iterates existing sessions and never calls
     * `destroy()`. Same fact as wallet-connector `provider.ts:305-309`.
     */
    function publish(built: DmkBuild): DmkBuild {
      if (dmkPromise !== build) {
        throw new Error(
          "connectDmkSession: closeDmk() tore down this DMK while it was still building — retry to connect over a fresh one",
        );
      }
      dmkInstance = built.dmk;
      return built;
    }

    const build: Promise<DmkBuild> = (async () => {
      // No .addLogger() on either path: DMK's own send/error logs include
      // full APDU payload bytes.
      if (override) {
        const { DeviceManagementKitBuilder } = await import("@ledgerhq/device-management-kit");
        const dmk = new DeviceManagementKitBuilder().addTransport(override.transportFactory).build();
        return publish({ dmk, transportIdentifier: override.transportIdentifier });
      }
      const [{ DeviceManagementKitBuilder }, { webHidTransportFactory, webHidIdentifier }] = await Promise.all([
        import("@ledgerhq/device-management-kit"),
        import("@ledgerhq/device-transport-kit-web-hid"),
      ]);
      const dmk = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
      return publish({ dmk, transportIdentifier: webHidIdentifier });
    })().catch((error) => {
      if (dmkPromise === build) dmkPromise = undefined;
      throw error;
    });

    dmkPromise = build;
  }
  return dmkPromise;
}

/**
 * Discover and connect to a device, returning a handle for further commands.
 *
 * MUST be called from a user gesture: WebHID is Chromium-only, needs a secure
 * context, and its picker fails silently otherwise.
 *
 * @throws If no device is selected or the connection fails
 */
export async function connectDmkSession(): Promise<DmkSessionHandle> {
  // The identifier comes from the build, never from a re-read of the override:
  // discovery must target the transport THIS DMK registered.
  const { dmk, transportIdentifier } = await getDmk();
  const { firstValueFrom } = await import("rxjs");

  // The browser picker guarantees a single device, so the first emission is
  // the selection; unsubscribing immediately stops discovery. (Speculos'
  // startDiscovering likewise emits its single device.)
  const device: DiscoveredDevice = await firstValueFrom(dmk.startDiscovering({ transport: transportIdentifier }));

  const sessionId = await dmk.connect({
    device,
    sessionRefresherOptions: SESSION_REFRESHER_OPTIONS,
  });

  const app = await readAppAndVersion(dmk, sessionId);
  return { dmk, sessionId, ...app };
}

/**
 * `GET_APP_AND_VERSION` preflight, run only at connect — the most useful fact
 * when the first vault APDU fails ("Babylon Vault" vs "Babylon Vault Testnet"
 * vs "BOLOS"). Sent explicitly rather than read from DMK's internal session
 * state. Diagnostic only: a failed read degrades to `undefined`.
 */
async function readAppAndVersion(
  dmk: DeviceManagementKit,
  sessionId: DeviceSessionId,
): Promise<{ appName?: string; appVersion?: string }> {
  try {
    const { GetAppAndVersionCommand, isSuccessCommandResult } = await import("@ledgerhq/device-management-kit");
    const result = await dmk.sendCommand({ sessionId, command: new GetAppAndVersionCommand() });
    if (!isSuccessCommandResult(result)) return {};
    return { appName: result.data.name, appVersion: result.data.version };
  } catch {
    // Preflight is diagnostics; the ceremony APDUs carry their own errors.
    return {};
  }
}

/**
 * True while the session is usable (dead sessions must be rebuilt from
 * discovery). The signal is the `DeviceSessionNotFound` THROW — DMK never
 * emits a "NOT CONNECTED" state. A just-unplugged device may briefly report
 * alive; the first ceremony APDU then rejects loudly.
 */
export async function isSessionAlive(handle: DmkSessionHandle): Promise<boolean> {
  const { firstValueFrom } = await import("rxjs");
  try {
    await firstValueFrom(handle.dmk.getDeviceSessionState({ sessionId: handle.sessionId }));
    return true;
  } catch (error) {
    // DMK errors do not extend Error; classify on `_tag`, as connectWallet does.
    if ((error as { _tag?: string } | undefined)?._tag === "DeviceSessionNotFound") return false;
    throw error;
  }
}

/** Disconnect the session; safe to call when already disconnected. */
export async function disconnectDmkSession(handle: DmkSessionHandle): Promise<void> {
  try {
    await handle.dmk.disconnect({ sessionId: handle.sessionId });
  } catch {
    // Already gone — the caller's intent (no live session) is satisfied.
  }
}

/**
 * Tear down the singleton. Only for app shutdown or tests; a provider
 * disconnect should use {@link disconnectDmkSession} and leave the DMK up.
 */
export function closeDmk(): void {
  dmkInstance?.close();
  dmkInstance = undefined;
  dmkPromise = undefined;
}
