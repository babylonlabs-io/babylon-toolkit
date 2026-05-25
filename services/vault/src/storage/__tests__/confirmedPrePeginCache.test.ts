import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addConfirmedPrePeginTxid,
  loadConfirmedPrePeginTxids,
} from "../confirmedPrePeginCache";

vi.mock("@/config", () => ({
  getBTCNetwork: () => "signet",
}));

const STORAGE_KEY = "tbv-confirmed-prepegin-signet";
const TTL_MS = 60 * 60 * 1000;

describe("confirmedPrePeginCache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores a fresh observation and returns it on load", () => {
    addConfirmedPrePeginTxid("aabb");
    expect(loadConfirmedPrePeginTxids().has("aabb")).toBe(true);
  });

  it("returns an empty set when storage is empty", () => {
    expect(loadConfirmedPrePeginTxids().size).toBe(0);
  });

  it("evicts entries older than the TTL on load", () => {
    addConfirmedPrePeginTxid("fresh");
    // Manually seed an old entry from "55 days ago" — past the 30d TTL.
    const raw = localStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map["stale"] = Date.now() - 55 * 24 * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));

    const loaded = loadConfirmedPrePeginTxids();
    expect(loaded.has("fresh")).toBe(true);
    expect(loaded.has("stale")).toBe(false);
  });

  it("treats entries at exactly the TTL boundary as expired", () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    // ts = now - TTL: cutoff is `now - TTL`, condition is `ts > cutoff`,
    // so an entry exactly at the boundary should be dropped.
    map["boundary"] = Date.now() - TTL_MS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));

    expect(loadConfirmedPrePeginTxids().has("boundary")).toBe(false);
  });

  it("does not duplicate or refresh the timestamp when adding a known txid", () => {
    addConfirmedPrePeginTxid("aabb");
    const firstTs = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")[
      "aabb"
    ];

    // Well inside the TTL so the re-add reuses the existing entry rather
    // than being treated as fresh.
    vi.advanceTimersByTime(60 * 1000);
    addConfirmedPrePeginTxid("aabb");
    const secondTs = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")[
      "aabb"
    ];

    expect(secondTs).toBe(firstTs);
  });

  it("opportunistically prunes expired entries when adding a new one", () => {
    // Seed an expired entry.
    const map = { stale: Date.now() - 60 * 24 * 60 * 60 * 1000 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));

    addConfirmedPrePeginTxid("fresh");

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(persisted).toEqual({ fresh: expect.any(Number) });
  });

  it("ignores corrupted storage values without throwing", () => {
    localStorage.setItem(STORAGE_KEY, "not json {");
    expect(loadConfirmedPrePeginTxids().size).toBe(0);
  });

  it("ignores empty/whitespace txid passed to add", () => {
    addConfirmedPrePeginTxid("");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
