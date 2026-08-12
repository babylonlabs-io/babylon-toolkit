/**
 * DMK session lifecycle: discovery → connect → state gate → dispose behind a
 * Promise API, so everything above this file is device-free and testable.
 * Verified against the installed DMK 1.7.1 types, not the published docs.
 *
 * @module wallets/btc/ledger-vault/dmkSession
 */

import type { DeviceManagementKit, DeviceSessionId, DiscoveredDevice } from "@ledgerhq/device-management-kit";

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
 * not a React tree here). Two instances would register duplicate transport
 * listeners.
 */
let dmkInstance: DeviceManagementKit | undefined;
let dmkPromise: Promise<DeviceManagementKit> | undefined;

/**
 * Build (or reuse) the DMK instance. Memoised as a PROMISE, not the instance:
 * a check-then-act across the dynamic imports would let two concurrent
 * connects build two DMKs, and the loser's transport keeps live WebHID
 * listeners forever. A failed build clears the memo (identity-guarded) so
 * the next connect retries.
 *
 * Every `@ledgerhq/device-*` import is dynamic so a provider that ships
 * disabled stays off the bundle's critical path — DMK pulls in xstate,
 * inversify, reflect-metadata and purify-ts.
 */
function getDmk(): Promise<DeviceManagementKit> {
  if (!dmkPromise) {
    const build = (async () => {
      const [{ DeviceManagementKitBuilder }, { webHidTransportFactory }] = await Promise.all([
        import("@ledgerhq/device-management-kit"),
        import("@ledgerhq/device-transport-kit-web-hid"),
      ]);
      dmkInstance = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
      return dmkInstance;
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
