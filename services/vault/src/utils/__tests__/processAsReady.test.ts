import { describe, expect, it } from "vitest";

import { processAsReady } from "../processAsReady";

describe("processAsReady", () => {
  it("processes items in the order their waits settle, not array order", async () => {
    const order: string[] = [];
    const delays: Record<string, number> = { A: 40, B: 10, C: 25 };
    await processAsReady(
      ["A", "B", "C"],
      (item) => new Promise<void>((r) => setTimeout(r, delays[item])),
      async (item) => {
        order.push(item);
      },
    );
    expect(order).toEqual(["B", "C", "A"]);
  });

  it("never overlaps process calls (safe for serialized wallet signing)", async () => {
    let active = 0;
    let maxActive = 0;
    await processAsReady(
      ["A", "B", "C"],
      () => Promise.resolve(),
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((r) => setTimeout(r, 5));
        active--;
      },
    );
    expect(maxActive).toBe(1);
  });

  it("passes the wait error to process and still processes every item", async () => {
    const seen: Array<{ item: string; failed: boolean }> = [];
    await processAsReady(
      ["A", "B"],
      (item) =>
        item === "A" ? Promise.reject(new Error("boom")) : Promise.resolve(),
      async (item, waitError) => {
        seen.push({ item, failed: waitError != null });
      },
    );
    expect(seen).toHaveLength(2);
    expect(seen.find((s) => s.item === "A")?.failed).toBe(true);
    expect(seen.find((s) => s.item === "B")?.failed).toBe(false);
  });

  it("processes each item exactly once", async () => {
    const counts = new Map<string, number>();
    await processAsReady(
      ["A", "B", "C"],
      () => Promise.resolve(),
      async (item) => {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      },
    );
    expect([...counts.values()]).toEqual([1, 1, 1]);
  });

  it("does not call process for an empty list", async () => {
    let called = false;
    await processAsReady(
      [],
      () => Promise.resolve(),
      async () => {
        called = true;
      },
    );
    expect(called).toBe(false);
  });
});
