/**
 * Feature detection for `IBTCProvider.subscribeDeviceAppState` — the optional
 * device-app wait only hardware providers implement (currently the Ledger
 * vault provider). Sibling of `signingProgress.ts` and `cancelSigning.ts`.
 */

import type {
  DeviceAppState,
  IBTCProvider,
} from "@babylonlabs-io/wallet-connector";

type DeviceAppStateListener = (state: DeviceAppState) => void;

/**
 * Subscribes when the provider implements the affordance; otherwise returns a
 * no-op unsubscribe so callers never branch. A subscribe that returns no
 * function throws here rather than leaking the listener. Takes `unknown`
 * because callers hold the connector's provider behind a loose type.
 */
export function observeDeviceAppState(
  provider: unknown,
  listener: DeviceAppStateListener,
): () => void {
  const candidate = provider as Pick<
    IBTCProvider,
    "subscribeDeviceAppState"
  > | null;
  if (typeof candidate?.subscribeDeviceAppState !== "function") {
    return () => {};
  }
  const stop = candidate.subscribeDeviceAppState(listener);
  if (typeof stop !== "function") {
    throw new Error(
      `provider.subscribeDeviceAppState must return an unsubscribe function; got ${typeof stop}`,
    );
  }
  return stop;
}
