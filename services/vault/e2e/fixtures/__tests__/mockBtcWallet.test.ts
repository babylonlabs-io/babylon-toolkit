import * as bitcoin from "bitcoinjs-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockBtcWallet } from "../mockBtcWallet";

const SIGNET_NETWORK: bitcoin.networks.Network = {
  ...bitcoin.networks.testnet,
  bech32: "tb",
};

describe("createMockBtcWallet defaults", () => {
  it("returns the same address every call", async () => {
    const { provider } = createMockBtcWallet();
    expect(await provider.getAddress()).toBe(await provider.getAddress());
  });

  it("returns the same public key every call", async () => {
    const { provider } = createMockBtcWallet();
    const pk = await provider.getPublicKeyHex();
    expect(pk).toMatch(/^[0-9a-f]{66}$/);
    expect(await provider.getPublicKeyHex()).toBe(pk);
  });

  it("returns 64-char lowercase hex from deriveContextHash", async () => {
    const { provider } = createMockBtcWallet();
    const hash = await provider.deriveContextHash("vault-app", "ab".repeat(8));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("deriveContextHash is deterministic for the same inputs", async () => {
    const { provider } = createMockBtcWallet();
    const a = await provider.deriveContextHash("vault-app", "00ff");
    const b = await provider.deriveContextHash("vault-app", "00ff");
    expect(a).toBe(b);
  });

  it("deriveContextHash differs across appName + context", async () => {
    const { provider } = createMockBtcWallet();
    const a = await provider.deriveContextHash("app-a", "00ff");
    const b = await provider.deriveContextHash("app-b", "00ff");
    const c = await provider.deriveContextHash("app-a", "00aa");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("signPsbt returns the input PSBT unchanged so it stays decodable", async () => {
    const { provider } = createMockBtcWallet();
    const psbt = "70736274ff0100";
    expect(await provider.signPsbt(psbt)).toBe(psbt);
  });

  it("signPsbts returns the input array unchanged", async () => {
    const { provider } = createMockBtcWallet();
    const inputs = ["aa", "bb", "cc"];
    const out = await provider.signPsbts(inputs);
    expect(out).toEqual(inputs);
    expect(out).not.toBe(inputs);
  });

  it("default address is a valid signet bech32 derived from the default pubkey", async () => {
    const { provider } = createMockBtcWallet();
    const address = await provider.getAddress();
    const pubkey = Buffer.from(await provider.getPublicKeyHex(), "hex");
    const expected = bitcoin.payments.p2wpkh({
      pubkey,
      network: SIGNET_NETWORK,
    }).address;
    expect(address).toBe(expected);
    // toOutputScript would throw on a malformed bech32; round-tripping
    // proves the constant is decodable, not just a string.
    expect(() =>
      bitcoin.address.toOutputScript(address, SIGNET_NETWORK),
    ).not.toThrow();
  });
});

describe("createMockBtcWallet config overrides", () => {
  it("respects publicKeyHex override", async () => {
    const { provider } = createMockBtcWallet({
      publicKeyHex: "02" + "11".repeat(32),
    });
    expect(await provider.getPublicKeyHex()).toBe("02" + "11".repeat(32));
  });

  it("respects address override", async () => {
    const { provider } = createMockBtcWallet({ address: "tb1qoverride" });
    expect(await provider.getAddress()).toBe("tb1qoverride");
  });
});

describe("MockBtcScript", () => {
  it("returnNext overrides the next call only", async () => {
    const { provider, script } = createMockBtcWallet();
    script.returnNext("getAddress", "tb1qscripted");
    expect(await provider.getAddress()).toBe("tb1qscripted");
    expect(await provider.getAddress()).not.toBe("tb1qscripted");
  });

  it("rejectNext makes the next call throw", async () => {
    const { provider, script } = createMockBtcWallet();
    script.rejectNext("signPsbt", new Error("user rejected"));
    await expect(provider.signPsbt("00")).rejects.toThrow("user rejected");
    // Subsequent call falls back to default
    await expect(provider.signPsbt("00")).resolves.toMatch(/^00/);
  });

  it("callCount tracks invocations", async () => {
    const { provider, script } = createMockBtcWallet();
    expect(script.callCount("getAddress")).toBe(0);
    await provider.getAddress();
    await provider.getAddress();
    expect(script.callCount("getAddress")).toBe(2);
    expect(script.callCount("signPsbt")).toBe(0);
  });

  it("clear discards queued overrides", async () => {
    const { provider, script } = createMockBtcWallet();
    script.returnNext("getAddress", "tb1qscripted");
    script.clear();
    expect(await provider.getAddress()).not.toBe("tb1qscripted");
  });

  it("queues multiple scripted overrides in order", async () => {
    const { provider, script } = createMockBtcWallet();
    script.returnNext("getAddress", "first");
    script.returnNext("getAddress", "second");
    expect(await provider.getAddress()).toBe("first");
    expect(await provider.getAddress()).toBe("second");
  });
});

describe("MockBtcScript.timeoutNext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects only after the scheduled delay elapses", async () => {
    const { provider, script } = createMockBtcWallet();
    script.timeoutNext("signPsbt", 5_000);

    const pending = provider.signPsbt("00ff");
    const settled = { value: false };
    const assertion = expect(pending).rejects.toThrow(
      "mock BTC wallet signPsbt timed out after 5000ms",
    );
    pending.catch(() => {
      settled.value = true;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled.value).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(settled.value).toBe(true);
  });

  it("consumes the queue entry so a subsequent call falls back to default", async () => {
    const { provider, script } = createMockBtcWallet({
      address: "tb1qfallback",
    });
    script.timeoutNext("getAddress", 1_000);

    const timedOut = provider.getAddress();
    const assertion = expect(timedOut).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    await expect(provider.getAddress()).resolves.toBe("tb1qfallback");
  });
});
