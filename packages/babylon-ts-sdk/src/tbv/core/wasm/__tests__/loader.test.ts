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

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(ENGINE);
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
