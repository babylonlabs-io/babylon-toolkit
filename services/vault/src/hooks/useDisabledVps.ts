/**
 * Hook that maintains a set of administratively-disabled vault provider
 * addresses, derived from the periodically-polled VP proxy health endpoint.
 *
 * Design decisions:
 * - A VP is "disabled" when it appears in the health response with
 *   `disabled === true`. The deposit picker drops disabled VPs from its list
 *   entirely (they cannot be selected for a new deposit), unlike unhealthy
 *   VPs (see {@link useUnhealthyVps}) which are shown but sorted to the bottom.
 * - VPs absent from the response, or present without the flag, are not
 *   disabled.
 * - On fetch error (5xx, network failure) the hook returns an empty set so
 *   all VPs remain visible (graceful degradation) — a disabled VP momentarily
 *   reappearing is preferable to hiding every VP when the proxy is down.
 */

import { useMemo } from "react";

import { useVpHealthSnapshots } from "./useVpHealth";

export function useDisabledVps(): Set<string> {
  const snapshots = useVpHealthSnapshots();

  return useMemo(() => {
    if (!snapshots) return new Set<string>();

    const disabled = new Set<string>();
    for (const snapshot of snapshots) {
      if (snapshot.disabled) {
        disabled.add(snapshot.address.toLowerCase());
      }
    }
    return disabled;
  }, [snapshots]);
}
