import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

import { COPY } from "@/copy";

export class BtcWalletLivenessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtcWalletLivenessError";
  }
}

/**
 * Minimal wallet shape needed to probe BTC wallet liveness.
 *
 * `getAddress()` on most providers (e.g. Unisat) returns a *cached* address and
 * does not round-trip to the extension, so it cannot detect a locked wallet on
 * its own. `connectWallet()` (→ `requestAccounts`) is the reliable probe: it is
 * idempotent/silent when the wallet is already unlocked on the right chain, and
 * rejects or times out when the wallet is locked or unresponsive.
 *
 * `connectWallet` is optional because the ts-sdk `BitcoinWallet` abstraction
 * does not declare it; the wallet-connector providers passed in at runtime
 * always implement it, so the probe runs in practice.
 */
type ProbableBtcWallet = Pick<BitcoinWallet, "getAddress"> & {
  connectWallet?: () => Promise<void>;
};

/**
 * Verify the connected BTC wallet is responsive and still holds the expected
 * account, before asking it to sign or derive.
 *
 * Note on latency: the `connectWallet()` probe round-trips to the extension via
 * `requestAccounts`, which uses the provider's own prompt timeout (e.g. Unisat's
 * 60s). A locked wallet that hangs (rather than rejecting) can therefore block
 * for up to that timeout before this throws — still strictly better than the
 * silent no-op it replaces, where signing appeared to start but no popup ever
 * showed.
 *
 * Note on the optional `connectWallet`: the `typeof === "function"` guard below
 * is a deliberate structural fallback for the ts-sdk `BitcoinWallet` type, which
 * does not declare `connectWallet`. It is NOT a live degrade path — every
 * wallet-connector BTC provider implements `connectWallet` (it is declared on
 * `IProvider`), so the round-trip always runs at runtime.
 */

export async function verifyBtcWalletLiveness(
  wallet: ProbableBtcWallet,
  expectedAddress: string,
): Promise<void> {
  // Round-trip to the extension first. A locked or unresponsive wallet rejects
  // or times out here; a cached `getAddress()` alone would falsely pass.
  if (typeof wallet.connectWallet === "function") {
    try {
      await wallet.connectWallet();
    } catch {
      throw new BtcWalletLivenessError(COPY.wallet.liveness.unresponsive);
    }
  }

  let observedAddress: string;
  try {
    observedAddress = await wallet.getAddress();
  } catch {
    throw new BtcWalletLivenessError(COPY.wallet.liveness.unresponsive);
  }

  if (!observedAddress) {
    throw new BtcWalletLivenessError(COPY.wallet.liveness.emptyAddress);
  }

  if (observedAddress !== expectedAddress) {
    throw new BtcWalletLivenessError(COPY.wallet.liveness.addressMismatch);
  }
}
