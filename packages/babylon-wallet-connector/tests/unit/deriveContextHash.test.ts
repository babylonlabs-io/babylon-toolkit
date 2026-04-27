/**
 * Unit tests for `deriveContextHash` adapter behavior.
 *
 * Tests the shared `unsupportedDeriveContextHash` helper used by every
 * non-supporting BTC adapter (OKX, OneKey, Ledger v1/v2, Keystone,
 * AppKit, Tomo, Injectable fallback) and the injectable wrapper that
 * stubs the method when the underlying wallet doesn't implement it.
 *
 * The provider classes themselves are not imported here — their
 * modules transitively pull in SVG asset imports that the unit-test
 * runner can't resolve. Centralizing the throw in
 * `unsupportedDeriveContextHash` lets us pin the cross-adapter
 * contract without depending on each adapter's full module graph.
 */

import { test, expect } from "@playwright/test";

import injectable from "../../src/core/wallets/btc/injectable";
import { unsupportedDeriveContextHash } from "../../src/core/wallets/btc/unsupportedDeriveContextHash";
import { ERROR_CODES, WalletError } from "../../src/error";

const FAKE_CONFIG = {} as never;

// ============================================================================
// unsupportedDeriveContextHash helper
// ============================================================================

test.describe("unsupportedDeriveContextHash helper", () => {
  test("returns a function that throws WALLET_METHOD_NOT_SUPPORTED", async () => {
    const stub = unsupportedDeriveContextHash("TestWallet");
    let caught: unknown;
    try {
      await stub("test-app", "deadbeef");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletError);
    expect((caught as WalletError).code).toBe(
      ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
    );
  });

  test("error includes the wallet name for debugging", async () => {
    const stub = unsupportedDeriveContextHash("OKX Wallet");
    let caught: WalletError | undefined;
    try {
      await stub("vault-app", "ab".repeat(36));
    } catch (e) {
      caught = e as WalletError;
    }
    expect(caught?.message).toContain("OKX Wallet");
    expect(caught?.message).toContain("deriveContextHash");
  });

  test("error includes the requesting appName for debugging", async () => {
    const stub = unsupportedDeriveContextHash("AnyWallet");
    let caught: WalletError | undefined;
    try {
      await stub("babylon-vault", "deadbeef");
    } catch (e) {
      caught = e as WalletError;
    }
    expect(caught?.message).toContain("babylon-vault");
  });

  test("error includes the context length for debugging", async () => {
    const stub = unsupportedDeriveContextHash("AnyWallet");
    const context = "ab".repeat(36); // 72 hex chars
    let caught: WalletError | undefined;
    try {
      await stub("test-app", context);
    } catch (e) {
      caught = e as WalletError;
    }
    expect(caught?.message).toContain(`${context.length}`);
  });

  test("returned function is reusable (does not retain state)", async () => {
    const stub = unsupportedDeriveContextHash("ReusableWallet");
    let caught1: WalletError | undefined;
    let caught2: WalletError | undefined;
    try {
      await stub("app-1", "00");
    } catch (e) {
      caught1 = e as WalletError;
    }
    try {
      await stub("app-2", "11");
    } catch (e) {
      caught2 = e as WalletError;
    }
    expect(caught1?.code).toBe(ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED);
    expect(caught2?.code).toBe(ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED);
    expect(caught1?.message).toContain("app-1");
    expect(caught2?.message).toContain("app-2");
  });
});

// ============================================================================
// Injectable wrapper
// ============================================================================

test.describe("injectable adapter wraps wallets without deriveContextHash", () => {
  test("injects WALLET_METHOD_NOT_SUPPORTED stub when underlying wallet lacks the method", async () => {
    // Underlying wallet shape with everything except deriveContextHash.
    const stub = {
      connectWallet: async () => undefined,
      getAddress: async () => "addr",
      getPublicKeyHex: async () => "pk",
      signPsbt: async () => "",
      signPsbts: async () => [],
      getNetwork: async () => "mainnet" as never,
      signMessage: async () => "",
      getInscriptions: async () => [],
      on: () => {},
      off: () => {},
      getWalletProviderName: async () => "Stubbed",
      getWalletProviderIcon: async () => "",
    } as never;

    const provider = injectable.createProvider(stub, FAKE_CONFIG);
    let caught: unknown;
    try {
      await provider.deriveContextHash("test-app", "deadbeef");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletError);
    expect((caught as WalletError).code).toBe(
      ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
    );
    expect((caught as WalletError).message).toContain("Injectable");
  });

  test("passes through wallets that already implement deriveContextHash", async () => {
    const sentinel = "a".repeat(64);
    const stub = {
      connectWallet: async () => undefined,
      getAddress: async () => "addr",
      getPublicKeyHex: async () => "pk",
      signPsbt: async () => "",
      signPsbts: async () => [],
      getNetwork: async () => "mainnet" as never,
      signMessage: async () => "",
      getInscriptions: async () => [],
      on: () => {},
      off: () => {},
      getWalletProviderName: async () => "Conformant",
      getWalletProviderIcon: async () => "",
      deriveContextHash: async () => sentinel,
    } as never;

    const provider = injectable.createProvider(stub, FAKE_CONFIG);
    const out = await provider.deriveContextHash("test-app", "deadbeef");
    expect(out).toBe(sentinel);
  });

  // Regression test for codex P1 / greptile P1 review feedback:
  // object spread (`{ ...wallet, ... }`) only copies own enumerable
  // properties. If the injected wallet is a class instance whose
  // methods live on its prototype (regular method declarations, not
  // arrow-function class fields), spread strips them. Object.create
  // preserves the prototype chain so inherited methods stay reachable.
  test("preserves prototype-chain methods on class-instance injected wallets", async () => {
    class FakePrototypeWallet {
      // These methods live on the prototype, not as own properties.
      async connectWallet() {
        return undefined;
      }
      async getAddress() {
        return "prototype-addr";
      }
      async getPublicKeyHex() {
        return "prototype-pk";
      }
      async signPsbt() {
        return "signed-via-prototype";
      }
      async signPsbts() {
        return [];
      }
      async getNetwork(): Promise<never> {
        return "mainnet" as never;
      }
      async signMessage() {
        return "";
      }
      async getInscriptions() {
        return [];
      }
      on() {}
      off() {}
      async getWalletProviderName() {
        return "PrototypeWallet";
      }
      async getWalletProviderIcon() {
        return "";
      }
      // Note: no deriveContextHash — the wrapper must add a stub
      // WITHOUT losing the prototype methods above.
    }

    const wallet = new FakePrototypeWallet() as never;
    const provider = injectable.createProvider(wallet, FAKE_CONFIG);

    // Critical assertion: a prototype method is still reachable on the
    // wrapped object. With the old `{ ...wallet, ... }` shape, every
    // assertion below would have failed with "X is not a function".
    expect(typeof provider.signPsbt).toBe("function");
    expect(typeof provider.connectWallet).toBe("function");
    expect(typeof provider.getAddress).toBe("function");
    expect(await provider.getAddress()).toBe("prototype-addr");
    expect(await provider.signPsbt("hex" as never)).toBe("signed-via-prototype");

    // And the deriveContextHash stub still throws as expected.
    let caught: unknown;
    try {
      await provider.deriveContextHash("test-app", "deadbeef");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletError);
    expect((caught as WalletError).code).toBe(
      ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
    );
  });
});
