/**
 * Holds a derived HTLC secret between the two clicks of the Ledger activation
 * split: the secret is retrieved on the Babylon Vault app, then the
 * depositor opens the Ethereum app and continues. Without the pause the
 * Ethereum prompt would open while the Babylon Vault app is still on screen.
 *
 * CLAUDE.md §5: the secret still comes only from `deriveHtlcSecretHex` — this
 * hook only defers its hand-off, and the activation state machine re-checks
 * `sha256(secret) === hashlock` against the on-chain registry right before
 * submission. The secret lives in a ref, never in React state: only an
 * `isStaged` flag renders. A JS string cannot be zeroed, and this one is now
 * held for as long as the depositor takes to click Continue — until then,
 * a close, or a key change clears it — rather than for one function call.
 * The derivation's own byte buffers are still wiped at source.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { COPY } from "@/copy";

interface StagedSecret {
  /** The {@link useStagedHtlcSecret} `resetKey` the secret was derived under. */
  readonly key: string;
  readonly secretHex: string;
}

export interface StagedHtlcSecret {
  /** True while a secret derived under the current `resetKey` is held. */
  isStaged: boolean;
  stage: (secretHex: string) => void;
  /** Hands the secret over once and forgets it; throws when none is held. */
  take: () => string;
  /** Forgets any held secret. */
  clear: () => void;
}

/**
 * @param resetKey - Identity the secret is bound to (vault, BTC address,
 *   wallet). A change forgets the secret: it was derived for another context.
 */
export function useStagedHtlcSecret(resetKey: string): StagedHtlcSecret {
  const stagedRef = useRef<StagedSecret | null>(null);
  const [stagedKey, setStagedKey] = useState<string | null>(null);

  // Runs on a key change and on unmount. The flag is cleared with the
  // secret: left set, a key that changes and changes back (A -> B -> A) would
  // report a secret as staged that is no longer held.
  useEffect(
    () => () => {
      stagedRef.current = null;
      setStagedKey(null);
    },
    [resetKey],
  );

  const stage = useCallback(
    (secretHex: string) => {
      stagedRef.current = { key: resetKey, secretHex };
      setStagedKey(resetKey);
    },
    [resetKey],
  );

  const clear = useCallback(() => {
    stagedRef.current = null;
    setStagedKey(null);
  }, []);

  const take = useCallback((): string => {
    const staged = stagedRef.current;
    clear();
    if (staged === null || staged.key !== resetKey) {
      throw new Error(COPY.deposit.ledger.secretNotHeld);
    }
    return staged.secretHex;
  }, [clear, resetKey]);

  return { isStaged: stagedKey === resetKey, stage, take, clear };
}
