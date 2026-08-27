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
  it("names the engine package when the import fails", async () => {
    vi.doMock(ENGINE, () => {
      throw new Error("Cannot find package");
    });

    const { loadTbvWasm } = await import("../index");

    await expect(loadTbvWasm()).rejects.toThrow(
      "@babylonlabs-io/babylon-tbv-rust-wasm failed to load",
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

    await expect(loadTbvWasm()).rejects.toThrow("failed to load");
    const engine = await loadTbvWasm();
    expect(engine).toMatchObject({ deriveVaultId: expect.any(Function) });
    expect(attempt).toBe(2);
  });

  it("imports once and shares the module across callers", async () => {
    vi.doMock(ENGINE, () => ({ deriveVaultId: () => "ok" }));

    const { loadTbvWasm } = await import("../index");

    const [first, second] = await Promise.all([loadTbvWasm(), loadTbvWasm()]);
    expect(first).toBe(second);
  });
});

describe("loadRawTbvWasm", () => {
  it("names the raw entry when the import fails", async () => {
    vi.doMock(RAW, () => {
      throw new Error("Cannot find package");
    });

    const { loadRawTbvWasm } = await import("../index");

    await expect(loadRawTbvWasm()).rejects.toThrow(
      "@babylonlabs-io/babylon-tbv-rust-wasm/raw failed to load",
    );
  });

  it("blames initialization, not a missing dependency, when initWasm throws", async () => {
    // The entry resolved: telling an operator to install a package they already
    // have hides the real cause, which survives only in the cause chain.
    vi.doMock(RAW, () => ({
      initWasm: async () => {
        throw new Error("wasm instantiation failed");
      },
    }));

    const { loadRawTbvWasm } = await import("../index");

    const error = await loadRawTbvWasm().catch((thrown: unknown) => thrown);
    expect((error as Error).message).toMatch(/binary failed to initialize/);
    expect(causeMessages(error)).toContain("wasm instantiation failed");
  });

  it("clears the cache after an initWasm failure so a retry re-initializes", async () => {
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

    await expect(loadRawTbvWasm()).rejects.toThrow(/failed to initialize/);
    await expect(loadRawTbvWasm()).resolves.toMatchObject({
      initWasm: expect.any(Function),
    });
    expect(initCalls).toBe(2);
  });
});
