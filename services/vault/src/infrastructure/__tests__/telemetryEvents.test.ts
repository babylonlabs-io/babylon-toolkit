import { describe, expect, it } from "vitest";

import { scrubString } from "../../utils/telemetry";
import { amountBucket, shortId } from "../telemetryEvents";

describe("amountBucket", () => {
  it("buckets amounts into coarse BTC bands", () => {
    expect(amountBucket(0.004)).toBe("<0.01");
    expect(amountBucket(0.05)).toBe("0.01-0.1");
    expect(amountBucket(0.5)).toBe("0.1-1");
    expect(amountBucket(3)).toBe("1-5");
    expect(amountBucket(9)).toBe("5+");
  });

  it("returns the lower band's label at each boundary (bands are half-open)", () => {
    expect(amountBucket(0.01)).toBe("0.01-0.1");
    expect(amountBucket(0.1)).toBe("0.1-1");
    expect(amountBucket(1)).toBe("1-5");
    expect(amountBucket(5)).toBe("5+");
  });

  it("returns 'unknown' for non-finite or negative input rather than a band", () => {
    expect(amountBucket(NaN)).toBe("unknown");
    expect(amountBucket(-1)).toBe("unknown");
  });

  it("never returns the raw amount", () => {
    expect(amountBucket(1.23456789)).toBe("1-5");
  });
});

describe("shortId", () => {
  it("shortens a long identifier to first4...last4", () => {
    const vaultId = "0x" + "a".repeat(64);
    expect(shortId(vaultId)).toBe("0xaa...aaaa");
  });

  it("produces a form that survives scrubString (stays a usable join key)", () => {
    // A raw ETH-address provider id and a raw keccak vaultId are both rewritten
    // by scrubString; the shortened form must pass through unchanged.
    const providerAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80";
    const vaultId = "0x" + "b".repeat(64);

    expect(scrubString(providerAddress)).toBe("[ETH_ADDR]");
    expect(scrubString(vaultId)).toBe("[HEX_REDACTED]");

    expect(scrubString(shortId(providerAddress))).toBe(
      shortId(providerAddress),
    );
    expect(scrubString(shortId(vaultId))).toBe(shortId(vaultId));
  });
});
