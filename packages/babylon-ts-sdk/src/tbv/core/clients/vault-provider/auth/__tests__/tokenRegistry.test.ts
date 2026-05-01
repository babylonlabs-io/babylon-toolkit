import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcClient } from "../../json-rpc-client";
import { VpTokenProvider } from "../tokenProvider";
import {
  VpTokenRegistry,
  vpTokenRegistry,
  type VpTokenRegistryInput,
} from "../tokenRegistry";

import {
  GOLDEN_SIGNING_KEY_XONLY,
} from "./goldenVectors";

const PEGIN_TXID_A = "a".repeat(64);
const PEGIN_TXID_B = "b".repeat(64);
const AUTH_ANCHOR_HEX = "c".repeat(64);
const ALT_AUTH_ANCHOR_HEX = "d".repeat(64);
// Mint the brand at the test boundary — production callers receive
// `OnChainBtcPubkey` from the on-chain reader, but tests fabricate
// values directly.
const PINNED_PUBKEY =
  GOLDEN_SIGNING_KEY_XONLY as unknown as import("../../../eth").OnChainBtcPubkey;
const ALT_PINNED_PUBKEY = "e".repeat(
  64,
) as unknown as import("../../../eth").OnChainBtcPubkey;

function buildClient(): JsonRpcClient {
  return new JsonRpcClient({
    baseUrl: "https://vp.example.com/rpc",
    timeout: 5000,
    retries: 0,
  });
}

function buildInput(
  overrides: Partial<VpTokenRegistryInput> = {},
): VpTokenRegistryInput {
  return {
    client: buildClient(),
    peginTxid: PEGIN_TXID_A,
    authAnchorHex: AUTH_ANCHOR_HEX,
    pinnedServerPubkey: PINNED_PUBKEY,
    ...overrides,
  };
}

describe("VpTokenRegistry", () => {
  let registry: VpTokenRegistry;

  beforeEach(() => {
    registry = new VpTokenRegistry();
  });

  it("returns a fresh provider on the first getOrCreate", () => {
    const provider = registry.getOrCreate(buildInput());
    expect(provider).toBeInstanceOf(VpTokenProvider);
    expect(registry.size).toBe(1);
  });

  it("returns the same provider instance for repeated getOrCreate with identical inputs", () => {
    // Idempotent on `(peginTxid, authAnchorHex, pinnedServerPubkey)`.
    // Sharing the instance is the whole point — multiple deposit-flow
    // components reach the same single-flight cache.
    const a = registry.getOrCreate(buildInput());
    const b = registry.getOrCreate(buildInput());
    expect(b).toBe(a);
    expect(registry.size).toBe(1);
  });

  it("ignores client identity when matching cached entries", () => {
    // The `client` argument is a transport detail; the registry binds
    // by pegin/anchor/pubkey only. First caller's client wins for the
    // cached provider.
    const first = registry.getOrCreate(
      buildInput({ client: buildClient() }),
    );
    const second = registry.getOrCreate(
      buildInput({ client: buildClient() }),
    );
    expect(second).toBe(first);
  });

  it("throws on getOrCreate with the same peginTxid but a different authAnchorHex", () => {
    // Silent overwrite would mask a derivation-drift bug — the caller
    // is requesting a token for a Pre-PegIn whose committed anchor
    // doesn't match what the registry already has.
    registry.getOrCreate(buildInput({ authAnchorHex: AUTH_ANCHOR_HEX }));
    expect(() =>
      registry.getOrCreate(buildInput({ authAnchorHex: ALT_AUTH_ANCHOR_HEX })),
    ).toThrow(/already bound to authAnchorHex/);
  });

  it("throws on getOrCreate with the same peginTxid but a different pinnedServerPubkey", () => {
    // VP pubkey rotation mid-flow, or one caller sourcing the pubkey
    // from an untrusted mirror — both must fail loud, not silently.
    registry.getOrCreate(
      buildInput({ pinnedServerPubkey: PINNED_PUBKEY }),
    );
    expect(() =>
      registry.getOrCreate(
        buildInput({ pinnedServerPubkey: ALT_PINNED_PUBKEY }),
      ),
    ).toThrow(/already bound to pinnedServerPubkey/);
  });

  it("getOrCreate cache-hit swaps in the new client so URL changes don't leave a stale transport", () => {
    // VP URL change mid-session: same identity, new transport. The
    // cached provider's token (bound to identity, not URL) stays
    // valid, but token refreshes must hit the new URL.
    const firstClient = buildClient();
    const provider = registry.getOrCreate(buildInput({ client: firstClient }));
    const setClientSpy = vi.spyOn(provider, "setClient");

    const secondClient = buildClient();
    const reused = registry.getOrCreate(buildInput({ client: secondClient }));

    expect(reused).toBe(provider);
    expect(setClientSpy).toHaveBeenCalledExactlyOnceWith(secondClient);
  });

  it("scopes entries by peginTxid — distinct pegins get distinct providers", () => {
    const a = registry.getOrCreate(buildInput({ peginTxid: PEGIN_TXID_A }));
    const b = registry.getOrCreate(buildInput({ peginTxid: PEGIN_TXID_B }));
    expect(b).not.toBe(a);
    expect(registry.size).toBe(2);
  });

  it("release(peginTxid) evicts that entry; the next getOrCreate produces a fresh provider", () => {
    const before = registry.getOrCreate(buildInput());
    registry.release(PEGIN_TXID_A);
    expect(registry.size).toBe(0);

    const after = registry.getOrCreate(buildInput());
    expect(after).not.toBe(before);
    expect(registry.size).toBe(1);
  });

  it("release is a no-op when the peginTxid is unknown", () => {
    // Never throws — callers may speculatively release on flow exit.
    registry.release(PEGIN_TXID_A);
    expect(registry.size).toBe(0);
  });

  it("clear() wipes every entry", () => {
    registry.getOrCreate(buildInput({ peginTxid: PEGIN_TXID_A }));
    registry.getOrCreate(buildInput({ peginTxid: PEGIN_TXID_B }));
    expect(registry.size).toBe(2);
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it("after release-then-getOrCreate with a different anchor, no cross-contamination", () => {
    // Eviction must reset all bound fields; otherwise the mismatch
    // throw could falsely fire on the post-release call.
    registry.getOrCreate(buildInput({ authAnchorHex: AUTH_ANCHOR_HEX }));
    registry.release(PEGIN_TXID_A);
    expect(() =>
      registry.getOrCreate(buildInput({ authAnchorHex: ALT_AUTH_ANCHOR_HEX })),
    ).not.toThrow();
  });

  it("does not touch localStorage or sessionStorage", () => {
    // Tokens in browser-readable storage are an XSS exposure with no
    // offsetting benefit. Pin the no-persistence contract by stubbing
    // both storages and asserting nothing wrote.
    const localSetItem = vi.fn();
    const sessionSetItem = vi.fn();
    vi.stubGlobal("localStorage", {
      setItem: localSetItem,
      getItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", {
      setItem: sessionSetItem,
      getItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });

    try {
      registry.getOrCreate(buildInput());
      registry.release(PEGIN_TXID_A);
      registry.clear();

      expect(localSetItem).not.toHaveBeenCalled();
      expect(sessionSetItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("vpTokenRegistry singleton", () => {
  // Ensure singleton tests don't leak state into one another.
  afterEach(() => {
    (vpTokenRegistry as VpTokenRegistry).clear();
  });

  it("is a singleton: subsequent imports share state", () => {
    const a = vpTokenRegistry.getOrCreate(buildInput());
    const b = vpTokenRegistry.getOrCreate(buildInput());
    expect(b).toBe(a);
  });

  it("clear() drops all singleton entries between tests", () => {
    vpTokenRegistry.getOrCreate(buildInput({ peginTxid: PEGIN_TXID_A }));
    vpTokenRegistry.getOrCreate(buildInput({ peginTxid: PEGIN_TXID_B }));
    expect(vpTokenRegistry.size).toBe(2);
    (vpTokenRegistry as VpTokenRegistry).clear();
    expect(vpTokenRegistry.size).toBe(0);
  });
});
