import { describe, expect, it, vi } from "vitest";

import { batchPollByProvider } from "../batchPoll";
import { VP_BATCH_MAX_SIZE } from "../types";

interface Item {
  id: string;
  vaultId: string;
}

const A: Item = { id: "a", vaultId: "a".repeat(64) };
const B: Item = { id: "b", vaultId: "b".repeat(64) };
const C: Item = { id: "c", vaultId: "c".repeat(64) };
const UNKNOWN_VAULT_ID = "f".repeat(64);

function makeHandlers() {
  return {
    onItem: vi.fn(),
    onMissing: vi.fn(),
    onDuplicate: vi.fn(),
    onWholeBatchError: vi.fn(),
    onUnexpected: vi.fn(),
  };
}

describe("batchPollByProvider", () => {
  it("does not call the RPC for empty input", async () => {
    const batchCall = vi.fn();
    const h = makeHandlers();
    await batchPollByProvider<Item, unknown>({
      items: [],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(batchCall).not.toHaveBeenCalled();
    expect(h.onItem).not.toHaveBeenCalled();
  });

  it("dispatches onItem per envelope on the happy path", async () => {
    const h = makeHandlers();
    const batchCall = vi.fn().mockResolvedValue({
      results: [
        { vault_id: A.vaultId, result: { v: 1 }, error: null },
        { vault_id: B.vaultId, result: null, error: "PegIn not found" },
      ],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [A, B],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(h.onItem).toHaveBeenCalledTimes(2);
    expect(h.onItem).toHaveBeenCalledWith(
      A,
      expect.objectContaining({ result: { v: 1 }, error: null }),
    );
    expect(h.onItem).toHaveBeenCalledWith(
      B,
      expect.objectContaining({ result: null, error: "PegIn not found" }),
    );
  });

  it("errors an item with a malformed vault id without sending it", async () => {
    const h = makeHandlers();
    const BAD: Item = { id: "bad", vaultId: "not-a-vault-id" };
    const batchCall = vi.fn().mockResolvedValue({
      results: [{ vault_id: A.vaultId, result: { v: 1 }, error: null }],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [BAD, A],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(batchCall).toHaveBeenCalledWith([A.vaultId]);
    expect(h.onItem).toHaveBeenCalledWith(
      BAD,
      expect.objectContaining({ result: null, error: expect.stringContaining("Invalid vault id") }),
    );
    expect(h.onMissing).not.toHaveBeenCalled();
  });

  it("does not call the RPC when every item in a chunk has a malformed vault id", async () => {
    const h = makeHandlers();
    const batchCall = vi.fn();
    await batchPollByProvider<Item, unknown>({
      items: [{ id: "bad", vaultId: "" }],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(batchCall).not.toHaveBeenCalled();
    expect(h.onItem).toHaveBeenCalledOnce();
  });

  it("chunks by batchSize and calls the RPC once per chunk", async () => {
    const h = makeHandlers();
    const batchCall = vi
      .fn()
      .mockResolvedValueOnce({
        results: [
          { vault_id: A.vaultId, result: { v: 1 }, error: null },
          { vault_id: B.vaultId, result: { v: 2 }, error: null },
        ],
      })
      .mockResolvedValueOnce({
        results: [{ vault_id: C.vaultId, result: { v: 3 }, error: null }],
      });
    await batchPollByProvider<Item, { v: number }>({
      items: [A, B, C],
      getVaultId: (i) => i.vaultId,
      batchCall,
      batchSize: 2,
      ...h,
    });
    expect(batchCall).toHaveBeenCalledTimes(2);
    expect(batchCall).toHaveBeenNthCalledWith(1, [A.vaultId, B.vaultId]);
    expect(batchCall).toHaveBeenNthCalledWith(2, [C.vaultId]);
    expect(h.onItem).toHaveBeenCalledTimes(3);
  });

  it("invokes onWholeBatchError per failed chunk and continues subsequent chunks", async () => {
    const h = makeHandlers();
    const boom = new Error("transport down");
    const batchCall = vi
      .fn()
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce({
        results: [{ vault_id: C.vaultId, result: { v: 3 }, error: null }],
      });
    await batchPollByProvider<Item, { v: number }>({
      items: [A, B, C],
      getVaultId: (i) => i.vaultId,
      batchCall,
      batchSize: 2,
      ...h,
    });
    expect(h.onWholeBatchError).toHaveBeenCalledTimes(1);
    expect(h.onWholeBatchError).toHaveBeenCalledWith([A, B], boom);
    expect(h.onItem).toHaveBeenCalledWith(
      C,
      expect.objectContaining({ result: { v: 3 } }),
    );
  });

  it("invokes onMissing for items the server omitted", async () => {
    const h = makeHandlers();
    const batchCall = vi.fn().mockResolvedValue({
      results: [{ vault_id: A.vaultId, result: { v: 1 }, error: null }],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [A, B],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(h.onMissing).toHaveBeenCalledWith(B);
    expect(h.onMissing).toHaveBeenCalledTimes(1);
    expect(h.onItem).toHaveBeenCalledWith(A, expect.anything());
    expect(h.onItem).toHaveBeenCalledTimes(1);
  });

  it("invokes onDuplicate and skips onItem for duplicated vault ids", async () => {
    const h = makeHandlers();
    const batchCall = vi.fn().mockResolvedValue({
      results: [
        { vault_id: A.vaultId, result: { v: 1 }, error: null },
        { vault_id: A.vaultId, result: { v: 2 }, error: null },
      ],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [A],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(h.onDuplicate).toHaveBeenCalledWith(A);
    expect(h.onDuplicate).toHaveBeenCalledTimes(1);
    expect(h.onItem).not.toHaveBeenCalled();
  });

  it("fires onDuplicate exactly once per unique duplicated vault id (triple echo)", async () => {
    const h = makeHandlers();
    const batchCall = vi.fn().mockResolvedValue({
      results: [
        { vault_id: A.vaultId, result: { v: 1 }, error: null },
        { vault_id: A.vaultId, result: { v: 2 }, error: null },
        { vault_id: A.vaultId, result: { v: 3 }, error: null },
      ],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [A],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(h.onDuplicate).toHaveBeenCalledTimes(1);
    expect(h.onItem).not.toHaveBeenCalled();
  });

  it("dispatches onItem to non-duplicate items in a mixed batch", async () => {
    const h = makeHandlers();
    const batchCall = vi.fn().mockResolvedValue({
      results: [
        { vault_id: A.vaultId, result: { v: 1 }, error: null },
        { vault_id: A.vaultId, result: { v: 2 }, error: null },
        { vault_id: B.vaultId, result: { v: 3 }, error: null },
      ],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [A, B],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(h.onDuplicate).toHaveBeenCalledTimes(1);
    expect(h.onDuplicate).toHaveBeenCalledWith(A);
    expect(h.onItem).toHaveBeenCalledTimes(1);
    expect(h.onItem).toHaveBeenCalledWith(
      B,
      expect.objectContaining({ result: { v: 3 } }),
    );
  });

  it("invokes onDuplicateBatch once per chunk with the duplicate count", async () => {
    const handlers = {
      ...makeHandlers(),
      onDuplicateBatch: vi.fn(),
    };
    const batchCall = vi.fn().mockResolvedValue({
      results: [
        { vault_id: A.vaultId, result: { v: 1 }, error: null },
        { vault_id: A.vaultId, result: { v: 2 }, error: null },
        { vault_id: B.vaultId, result: { v: 3 }, error: null },
        { vault_id: B.vaultId, result: { v: 4 }, error: null },
      ],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [A, B],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...handlers,
    });
    expect(handlers.onDuplicateBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onDuplicateBatch).toHaveBeenCalledWith(2);
  });

  it("invokes onUnexpected with echoed-but-unrequested vault ids", async () => {
    const h = makeHandlers();
    const batchCall = vi.fn().mockResolvedValue({
      results: [
        { vault_id: A.vaultId, result: { v: 1 }, error: null },
        { vault_id: UNKNOWN_VAULT_ID, result: { v: 99 }, error: null },
      ],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [A],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(h.onUnexpected).toHaveBeenCalledWith([UNKNOWN_VAULT_ID]);
    expect(h.onItem).toHaveBeenCalledWith(A, expect.anything());
    expect(h.onItem).toHaveBeenCalledTimes(1);
  });

  it("silently drops unexpected vault ids when onUnexpected is not provided", async () => {
    const handlers = {
      onItem: vi.fn(),
      onMissing: vi.fn(),
      onDuplicate: vi.fn(),
      onWholeBatchError: vi.fn(),
    };
    const batchCall = vi.fn().mockResolvedValue({
      results: [
        { vault_id: A.vaultId, result: { v: 1 }, error: null },
        { vault_id: UNKNOWN_VAULT_ID, result: { v: 99 }, error: null },
      ],
    });
    await expect(
      batchPollByProvider<Item, { v: number }>({
        items: [A],
        getVaultId: (i) => i.vaultId,
        batchCall,
        ...handlers,
      }),
    ).resolves.toBeUndefined();
    expect(handlers.onItem).toHaveBeenCalledTimes(1);
  });

  it("defaults batchSize to VP_BATCH_MAX_SIZE when omitted", async () => {
    const h = makeHandlers();
    const items: Item[] = Array.from(
      { length: VP_BATCH_MAX_SIZE + 1 },
      (_, i) => ({
        id: `id-${i}`,
        vaultId: i.toString(16).padStart(64, "0"),
      }),
    );
    const batchCall = vi
      .fn()
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] });
    await batchPollByProvider<Item, unknown>({
      items,
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(batchCall).toHaveBeenCalledTimes(2);
    expect(batchCall.mock.calls[0][0]).toHaveLength(VP_BATCH_MAX_SIZE);
    expect(batchCall.mock.calls[1][0]).toHaveLength(1);
  });

  it("rejects non-positive batchSize up front", async () => {
    const h = makeHandlers();
    await expect(
      batchPollByProvider<Item, unknown>({
        items: [A],
        getVaultId: (i) => i.vaultId,
        batchCall: vi.fn(),
        batchSize: 0,
        ...h,
      }),
    ).rejects.toThrow(/batchSize must be a positive integer/);
    await expect(
      batchPollByProvider<Item, unknown>({
        items: [A],
        getVaultId: (i) => i.vaultId,
        batchCall: vi.fn(),
        batchSize: -1,
        ...h,
      }),
    ).rejects.toThrow(/batchSize must be a positive integer/);
  });

  it("routes attribution-time errors through onWholeBatchError", async () => {
    const h = makeHandlers();
    // Forge a response shape that breaks `attributeBatchResults` by
    // having a non-string `vault_id`. The helper must not abort the
    // polling pass — the caller should see the error via
    // `onWholeBatchError` and subsequent chunks should still execute.
    const batchCall = vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ vault_id: 123, result: { v: 1 }, error: null } as never],
      })
      .mockResolvedValueOnce({
        results: [{ vault_id: B.vaultId, result: { v: 2 }, error: null }],
      });
    await batchPollByProvider<Item, { v: number }>({
      items: [A, B],
      getVaultId: (i) => i.vaultId,
      batchCall,
      batchSize: 1,
      ...h,
    });
    expect(h.onWholeBatchError).toHaveBeenCalledTimes(1);
    expect(h.onWholeBatchError.mock.calls[0][0]).toEqual([A]);
    expect(h.onItem).toHaveBeenCalledWith(
      B,
      expect.objectContaining({ result: { v: 2 } }),
    );
  });

  it("normalizes mixed-case, 0x-prefixed vault ids before calling the RPC", async () => {
    const h = makeHandlers();
    const upperItem: Item = { id: "u", vaultId: `0x${A.vaultId.toUpperCase()}` };
    const batchCall = vi.fn().mockResolvedValue({
      results: [{ vault_id: A.vaultId, result: { v: 1 }, error: null }],
    });
    await batchPollByProvider<Item, { v: number }>({
      items: [upperItem],
      getVaultId: (i) => i.vaultId,
      batchCall,
      ...h,
    });
    expect(batchCall).toHaveBeenCalledWith([A.vaultId]);
    expect(h.onItem).toHaveBeenCalledWith(upperItem, expect.anything());
  });
});
