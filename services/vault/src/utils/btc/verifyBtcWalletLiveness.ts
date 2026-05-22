import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

import { COPY } from "@/copy";

export class BtcWalletLivenessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtcWalletLivenessError";
  }
}

/**
 * Wallet ids whose `connectWallet()` is a silent, idempotent re-request
 * (`requestAccounts` / `connect`) — safe to call as a liveness probe on an
 * already-connected wallet.
 *
 * Deliberately excludes:
 * - AppKit (`appkit-btc-connector`): its `connectWallet()` opens the AppKit
 *   modal and waits up to 60s for a fresh `connected` event, so probing it
 *   would reopen the modal / hang for an already-connected user.
 * - Hardware wallets (Ledger, Keystone): their `connectWallet()` re-engages the
 *   device (Ledger app calls, Keystone QR scan), i.e. it is interactive.
 *
 * For those, the round-trip probe is skipped and we fall back to a cached
 * `getAddress()` check; real lock-detection for them needs a dedicated
 * non-interactive liveness primitive in wallet-connector (tracked separately).
 *
 * Source of truth for the ids: the per-wallet `index.ts` files under
 * `packages/babylon-wallet-connector/src/core/wallets/btc`.
 */
const CONNECT_PROBE_WALLET_IDS = new Set(["unisat", "okx", "onekey"]);

/**
 * Whether `connectWallet()` can be used as a silent liveness probe for the
 * given connected-wallet id. Pass `btcConnector?.connectedWallet?.id`.
 */
export function shouldProbeWalletLiveness(
  walletId: string | undefined,
): boolean {
  return walletId !== undefined && CONNECT_PROBE_WALLET_IDS.has(walletId);
}

/**
 * Minimal wallet shape needed to probe BTC wallet liveness.
 *
 * `getAddress()` on most providers (e.g. Unisat) returns a *cached* address and
 * does not round-trip to the extension, so it cannot detect a locked wallet on
 * its own. `connectWallet()` (→ `requestAccounts`) is the reliable probe for
 * injected extensions, but it is unsafe for AppKit/hardware (see
 * {@link shouldProbeWalletLiveness}), so callers opt in via `probeConnection`.
 *
 * `connectWallet` is optional because the ts-sdk `BitcoinWallet` abstraction
 * does not declare it; the wallet-connector providers passed in at runtime
 * implement it.
 */
type ProbableBtcWallet = Pick<BitcoinWallet, "getAddress"> & {
  connectWallet?: () => Promise<void>;
};

export interface VerifyBtcWalletLivenessOptions {
  /**
   * Round-trip to the extension via `connectWallet()` before reading the
   * address. Only safe for wallets where that call is silent and idempotent —
   * gate it with {@link shouldProbeWalletLiveness}. Defaults to `false`.
   *
   * Latency note: when enabled, a locked wallet that *hangs* (rather than
   * rejecting) can block up to the provider's prompt timeout (e.g. Unisat's
   * 60s) before this throws — still better than a silent "Signing…" with no
   * popup.
   */
  probeConnection?: boolean;
}

export async function verifyBtcWalletLiveness(
  wallet: ProbableBtcWallet,
  expectedAddress: string,
  options: VerifyBtcWalletLivenessOptions = {},
): Promise<void> {
  // Round-trip to the extension first (only for probe-safe wallets). A locked
  // or unresponsive wallet rejects or times out here; a cached `getAddress()`
  // alone would falsely pass.
  if (options.probeConnection && typeof wallet.connectWallet === "function") {
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
