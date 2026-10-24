import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

import { COPY } from "@/copy";
import { chainCarriesCode } from "@/utils/errors/causeChain";
import {
  isDeviceDisconnectedError,
  isDeviceWrongAppError,
} from "@/utils/errors/deviceErrors";
import { isWalletIncompatibleVersion } from "@/utils/errors/walletIncompatibleVersion";

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
 * Wallet-connector code the provider's read timeout throws (mirrors
 * `ERROR_CODES.CONNECTION_FAILED`); this string must track it.
 */
const WALLET_CONNECTION_FAILED_CODE = "CONNECTION_FAILED";

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
 * implement it. `getAccounts` is the non-interactive read (UniSat only) used
 * as a fast channel check.
 */
type ProbableBtcWallet = Pick<BitcoinWallet, "getAddress"> & {
  connectWallet?: () => Promise<void>;
  getAccounts?: () => Promise<string[]>;
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
   * popup. A wallet that exposes `getAccounts` (Unisat) instead fails within
   * that read's timeout when its extension channel is unresponsive and the
   * tab is visible; from a hidden tab, and for other wallets, the
   * prompt-timeout behavior remains.
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
    // `getAccounts` is non-interactive and bounded by the provider's short RPC
    // timeout. It shares the extension's page channel with signing, so the
    // provider's read timeout (CONNECTION_FAILED) means the channel is gone and
    // only a page reload recovers it — the 60s interactive probe below would
    // hide that behind a spinner and the "unlock" copy. Any other rejection
    // keeps the existing liveness mapping. An empty result (locked wallet)
    // still falls through to `connectWallet()`. UniSat's page provider queues every request while the
    // tab is hidden, so a bounded read from a hidden tab would time out on a
    // healthy wallet; there the existing interactive probe (which waits for the
    // tab) is used instead.
    if (
      typeof wallet.getAccounts === "function" &&
      document.visibilityState === "visible"
    ) {
      try {
        await wallet.getAccounts();
      } catch (error) {
        throw chainCarriesCode(error, WALLET_CONNECTION_FAILED_CODE)
          ? new BtcWalletLivenessError(
              COPY.wallet.liveness.extensionDisconnected,
            )
          : toLivenessError(error);
      }
    }

    try {
      await wallet.connectWallet();
    } catch (error) {
      throw toLivenessError(error);
    }
  }

  let observedAddress: string;
  try {
    observedAddress = await wallet.getAddress();
  } catch (error) {
    throw toLivenessError(error);
  }

  if (!observedAddress) {
    throw new BtcWalletLivenessError(COPY.wallet.liveness.emptyAddress);
  }

  if (observedAddress !== expectedAddress) {
    throw new BtcWalletLivenessError(COPY.wallet.liveness.addressMismatch);
  }
}

/**
 * A lost hardware-device session and a device showing the wrong app (or still
 * locked on a session whose app is not yet confirmed, which the Ledger
 * provider reports the same way) pass through with their typed code, because
 * the caller's copy for each names the real recovery (reconnect, or open the
 * vault app). An unsupported wallet or app version also keeps its own message
 * (update the app). Every other failure reads as an unresponsive wallet.
 */
function toLivenessError(error: unknown): Error {
  if (
    (isDeviceDisconnectedError(error) ||
      isDeviceWrongAppError(error) ||
      isWalletIncompatibleVersion(error)) &&
    error instanceof Error
  ) {
    return error;
  }
  return new BtcWalletLivenessError(COPY.wallet.liveness.unresponsive);
}
