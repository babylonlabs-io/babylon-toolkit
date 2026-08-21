import { afterEach, describe, expect, it, vi } from "vitest";

/** Every message in an error's `cause` chain, outermost first. */
function causeMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages;
}

const ENGINE = "@babylonlabs-io/babylon-tbv-rust-wasm";
const RAW = "@babylonlabs-io/babylon-tbv-rust-wasm/raw";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(ENGINE);
  vi.doUnmock(RAW);
});

describe("loadTbvWasm", () => {
  it("names the missing peer when the engine cannot be resolved", async () => {
    vi.doMock(ENGINE, () => {
      throw new Error("Cannot find package");
    });

    const { loadTbvWasm } = await import("../index");

    await expect(loadTbvWasm()).rejects.toThrow(
      "requires the optional @babylonlabs-io/babylon-tbv-rust-wasm peer dependency",
    );
  });

  it("keeps the original resolution failure in the cause chain", async () => {
    vi.doMock(ENGINE, () => {
      throw new Error("Cannot find package");
    });

    const { loadTbvWasm } = await import("../index");

    // The operator needs the underlying resolver message, not just ours. Depth
    // is not asserted: the loader adds one link, the module runner may add its
    // own, and only the message surviving to the operator matters.
    const error = await loadTbvWasm().catch((thrown: unknown) => thrown);
    expect(causeMessages(error)).toContain("Cannot find package");
  });

  it("succeeds on a retry after a transient load failure", async () => {
    // A failed load clears the cached promise, so the next call imports again
    // rather than replaying the rejection forever.
    let attempt = 0;
    vi.doMock(ENGINE, () => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient network failure");
      return { deriveVaultId: () => "recovered" };
    });

    const { loadTbvWasm } = await import("../index");

    await expect(loadTbvWasm()).rejects.toThrow("peer dependency");
    const engine = await loadTbvWasm();
    expect(engine).toMatchObject({ deriveVaultId: expect.any(Function) });
    expect(attempt).toBe(2);
  });

  it("imports once and shares the module across callers", async () => {
    let attempt = 0;
    vi.doMock(ENGINE, () => {
      attempt += 1;
      return { deriveVaultId: () => "ok" };
    });

    const { loadTbvWasm } = await import("../index");

    const [first, second] = await Promise.all([loadTbvWasm(), loadTbvWasm()]);
    expect(first).toBe(second);
    expect(attempt).toBe(1);
  });
});

describe("loadRawTbvWasm", () => {
  it("names the missing raw entry when it cannot be resolved", async () => {
    vi.doMock(RAW, () => {
      throw new Error("Cannot find package");
    });

    const { loadRawTbvWasm } = await import("../index");

    await expect(loadRawTbvWasm()).rejects.toThrow(
      "requires the optional raw vault-WASM peer entry",
    );
  });

  it("surfaces an initWasm failure and still allows a retry", async () => {
    // initWasm runs inside the cached promise, so a failure there has to clear
    // the cache too or the engine is unusable for the rest of the session.
    let initCalls = 0;
    vi.doMock(RAW, () => ({
      initWasm: async () => {
        initCalls += 1;
        if (initCalls === 1) throw new Error("wasm instantiation failed");
      },
    }));

    const { loadRawTbvWasm } = await import("../index");

    await expect(loadRawTbvWasm()).rejects.toThrow("raw vault-WASM peer entry");
    await expect(loadRawTbvWasm()).resolves.toMatchObject({
      initWasm: expect.any(Function),
    });
    expect(initCalls).toBe(2);
  });
});
