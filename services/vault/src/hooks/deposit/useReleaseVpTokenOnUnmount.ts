import { vpTokenRegistry } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useCallback, useEffect, useRef } from "react";

/**
 * Tracks a peginTxid that the caller has primed in `vpTokenRegistry`
 * and releases it on unmount. Used to bound `authAnchorHex` lifetime
 * for resume flows where the user may close the modal without
 * completing activation (which is the normal release point).
 *
 * Returns a stable setter — caller invokes it with the txid AFTER
 * priming succeeds, so a failed prime doesn't leave a phantom release
 * target.
 */
export function useReleaseVpTokenOnUnmount(): (peginTxid: string) => void {
  const ref = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (ref.current) {
        vpTokenRegistry.release(ref.current);
        ref.current = null;
      }
    };
  }, []);
  return useCallback((peginTxid: string) => {
    ref.current = peginTxid;
  }, []);
}
