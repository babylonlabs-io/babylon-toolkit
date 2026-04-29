import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../../shared/wallets";
import type { OnChainBtcPubkey, VaultRegistryReader } from "../../../eth/types";
import { JsonRpcClient } from "../../json-rpc-client";
import { LazyVpTokenProvider } from "../lazyTokenProvider";
import { VpTokenProvider } from "../tokenProvider";
import { vpTokenRegistry } from "../tokenRegistry";

const PEGIN_TXID = "a".repeat(64);
const AUTH_ANCHOR = "b".repeat(64);
const PINNED_PUBKEY =
  "ab".repeat(32) as unknown as OnChainBtcPubkey;

function makeInnerClient(): JsonRpcClient {
  return new JsonRpcClient({
    baseUrl: "https://vp.test/rpc",
    timeout: 5000,
    retries: 0,
  });
}

function makeLazy(wallet: BitcoinWallet): LazyVpTokenProvider {
  return new LazyVpTokenProvider({
    client: makeInnerClient(),
    peginTxid: PEGIN_TXID,
    unsignedPrePeginTxHex: "deadbeef",
    depositorBtcPubkey: "ab".repeat(32),
    btcWallet: wallet,
    vaultRegistryReader: {
      getVaultProviderBtcPubKey: vi.fn(),
    } as unknown as VaultRegistryReader,
    vpAddress: `0x${"1".repeat(40)}`,
  });
}

describe("LazyVpTokenProvider — sibling rejection retry", () => {
  beforeEach(() => {
    vpTokenRegistry.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vpTokenRegistry.clear();
  });

  it("a sibling that peeked an in-flight rejecting promise retries on next getToken", async () => {
    // Pre-seed the registry with an in-flight promise that will reject.
    // This simulates Provider A having already started a derivation
    // that the user will reject.
    let rejectInFlight!: (err: unknown) => void;
    const inFlight = new Promise<VpTokenProvider>((_, rej) => {
      rejectInFlight = rej;
    });
    // Attach a no-op catch so vitest doesn't flag the registry's
    // .finally() chain as an unhandled rejection. (Production code
    // always has a `.catch(...)` consumer via the originating caller's
    // resolvedPromise chain; the test seeds the slot directly.)
    inFlight.catch(() => {});
    vpTokenRegistry.registerInFlight(PEGIN_TXID, inFlight);

    // Sibling lazy provider observes the in-flight slot via peekOrPending.
    // Track wallet calls — on the first getToken, peekOrPending returns
    // the rejecting promise, so the wallet must NOT be touched.
    const wallet = {
      deriveContextHash: vi.fn(async () => "00".repeat(32)),
    } as unknown as BitcoinWallet;
    const sibling = makeLazy(wallet);

    const firstCall = sibling
      .getToken("vaultProvider_submitDepositorWotsKey")
      .catch((e) => e);

    // Reject the in-flight; both A's call and the sibling's first call
    // observe the rejection.
    rejectInFlight(new Error("user rejected popup"));
    const firstResult = await firstCall;
    expect(firstResult).toBeInstanceOf(Error);
    expect((firstResult as Error).message).toBe("user rejected popup");
    expect(
      (wallet.deriveContextHash as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);

    // Yield to let the registry's in-flight finally-clear settle.
    await Promise.resolve();
    await Promise.resolve();

    // Pre-fix bug: sibling cached the rejected promise permanently
    // and the second getToken returns the SAME rejection without
    // retrying. Post-fix: resolvedPromise is wrapped in .catch(err =>
    // { this.resolvedPromise = null; throw err; }), so the next
    // getToken re-enters resolve() and starts a fresh derivation.
    // The fresh derivation fails too (invalid tx hex), but the
    // failure reason is different — proving the retry actually ran.
    const secondCall = sibling
      .getToken("vaultProvider_submitDepositorWotsKey")
      .catch((e) => e);
    const secondResult = await secondCall;

    expect(secondResult).toBeInstanceOf(Error);
    expect((secondResult as Error).message).not.toBe("user rejected popup");
  });

  it("after a successful in-flight resolve, sibling getToken returns the cached provider without re-deriving", async () => {
    const tokenProvider = new VpTokenProvider({
      client: makeInnerClient(),
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: new Set(["vaultProvider_submitDepositorWotsKey"]),
    });
    // Spy on getToken so we can confirm the sibling reaches the cached
    // provider without ever calling its own wallet.
    const tokenSpy = vi
      .spyOn(tokenProvider, "getToken")
      .mockResolvedValue("fresh-token");

    let resolveInFlight!: (p: VpTokenProvider) => void;
    const inFlight = new Promise<VpTokenProvider>((res) => {
      resolveInFlight = res;
    });
    vpTokenRegistry.registerInFlight(PEGIN_TXID, inFlight);

    const wallet = {
      deriveContextHash: vi.fn(async () => "00".repeat(32)),
    } as unknown as BitcoinWallet;
    const sibling = makeLazy(wallet);

    const callPromise = sibling.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    resolveInFlight(tokenProvider);
    const token = await callPromise;

    expect(token).toBe("fresh-token");
    expect(tokenSpy).toHaveBeenCalledOnce();
    expect(
      (wallet.deriveContextHash as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
  });
});
