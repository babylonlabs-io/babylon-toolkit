/**
 * DMK session lifecycle for the Ledger vault provider.
 *
 * Wraps discovery → connect → state gate → dispose behind a Promise API, so
 * everything above this file is device-free and testable with a fake.
 *
 * Verified against the installed `@ledgerhq/device-management-kit@1.7.1`
 * type declarations, not the published docs.
 *
 * @module wallets/btc/ledger-vault/dmkSession
 */

import type { DeviceManagementKit, DeviceSessionId, DiscoveredDevice } from "@ledgerhq/device-management-kit";

/**
 * The device pings itself on a timer when the refresher is on, injecting
 * `GET_APP_AND_VERSION` mid-ceremony. We do not yet know whether that
 * nullifies a loaded vault intent (open question with Ledger), and the option
 * is connection-level rather than a window we can open and close — so we
 * connect with it off and check device state only at safe boundaries.
 * Revisit once Ledger confirms which commands nullify.
 */
const SESSION_REFRESHER_OPTIONS = { isRefresherDisabled: true } as const;

export interface DmkSessionHandle {
  readonly dmk: DeviceManagementKit;
  readonly sessionId: DeviceSessionId;
}

/**
 * One DMK per application.
 *
 * The skill prescribes a React context, but the connector is not a React tree
 * at this layer, so this is a module-level lazy singleton instead — the
 * deviation is deliberate. Two instances would register duplicate transport
 * listeners.
 */
let dmkInstance: DeviceManagementKit | undefined;

/**
 * Build (or reuse) the DMK instance.
 *
 * Every `@ledgerhq/device-*` import is dynamic so a provider that ships
 * disabled stays off the bundle's critical path — DMK pulls in xstate,
 * inversify, reflect-metadata and purify-ts.
 */
async function getDmk(): Promise<DeviceManagementKit> {
  if (dmkInstance) return dmkInstance;

  const [{ DeviceManagementKitBuilder }, { webHidTransportFactory }] = await Promise.all([
    import("@ledgerhq/device-management-kit"),
    import("@ledgerhq/device-transport-kit-web-hid"),
  ]);

  dmkInstance = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
  return dmkInstance;
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
  const dmk = await getDmk();
  const [{ firstValueFrom }, { webHidIdentifier }] = await Promise.all([
    import("rxjs"),
    import("@ledgerhq/device-transport-kit-web-hid"),
  ]);

  // The browser picker guarantees a single device, so the first emission is
  // the selection; unsubscribing immediately stops discovery.
  const device: DiscoveredDevice = await firstValueFrom(dmk.startDiscovering({ transport: webHidIdentifier }));

  const sessionId = await dmk.connect({
    device,
    sessionRefresherOptions: SESSION_REFRESHER_OPTIONS,
  });

  return { dmk, sessionId };
}

/**
 * True when the session is still usable. A dead session must be rebuilt from
 * discovery — DMK has no reconnect-by-sessionId.
 *
 * DMK removes the session on disconnect, and `getDeviceSessionState` then THROWS
 * `DeviceSessionNotFound` rather than emitting a "NOT CONNECTED" state — so the
 * throw is the signal, not the status value. Residual window: inside DMK's
 * reconnect grace period a just-unplugged device still reports alive; the first
 * ceremony APDU then rejects loudly rather than hanging.
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
}
