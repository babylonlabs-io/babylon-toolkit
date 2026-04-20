import type { Event as SentryEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";

import {
  redactData,
  redactIdentifier,
  scrubSentryEvent,
  scrubString,
} from "../telemetry";

describe("redactIdentifier", () => {
  it("truncates long identifiers to first4...last4", () => {
    expect(redactIdentifier("bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5")).toBe(
      "bc1q...w4x5",
    );
  });

  it("returns short values unchanged", () => {
    expect(redactIdentifier("abcd1234")).toBe("abcd1234");
  });

  it("returns values shorter than threshold unchanged", () => {
    expect(redactIdentifier("abc")).toBe("abc");
  });

  it("returns [REDACTED] for short values when forceRedact is true", () => {
    expect(redactIdentifier("seed", true)).toBe("[REDACTED]");
    expect(redactIdentifier("abc", true)).toBe("[REDACTED]");
    expect(redactIdentifier("abcd1234", true)).toBe("[REDACTED]");
  });

  it("still truncates long values normally with forceRedact", () => {
    expect(redactIdentifier("bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5", true)).toBe(
      "bc1q...w4x5",
    );
  });
});

describe("scrubString", () => {
  it("replaces BTC bech32 mainnet addresses", () => {
    const input = "Error for bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    expect(scrubString(input)).toBe("Error for [BTC_ADDR]");
  });

  it("replaces BTC taproot addresses (bc1p, 62-char payload)", () => {
    const taprootAddr =
      "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3s7a";
    const input = `Taproot output ${taprootAddr}`;
    expect(scrubString(input)).toBe("Taproot output [BTC_ADDR]");
  });

  it("replaces BTC bech32 testnet addresses", () => {
    const input = "Sending to tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
    expect(scrubString(input)).toBe("Sending to [BTC_ADDR]");
  });

  it("replaces ETH addresses", () => {
    const input =
      "Contract at 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80 failed";
    expect(scrubString(input)).toBe("Contract at [ETH_ADDR] failed");
  });

  it("replaces Babylon addresses", () => {
    const input =
      "Delegator bbn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkw5hm3 not found";
    expect(scrubString(input)).toBe("Delegator [BBN_ADDR] not found");
  });

  it("replaces long hex strings (64+ chars)", () => {
    const hex64 = "a".repeat(64);
    const input = `Transaction ${hex64} failed`;
    expect(scrubString(input)).toBe("Transaction [HEX_REDACTED] failed");
  });

  it("replaces 0x-prefixed long hex strings (ETH tx hashes)", () => {
    const txHash = "0x" + "a".repeat(64);
    const input = `tx hash ${txHash} failed`;
    expect(scrubString(input)).toBe("tx hash [HEX_REDACTED] failed");
  });

  it("does not replace short hex strings", () => {
    const hex32 = "a".repeat(32);
    const input = `Error code ${hex32}`;
    expect(scrubString(input)).toBe(`Error code ${hex32}`);
  });

  it("replaces multiple patterns in one string", () => {
    const input =
      "Transfer from 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80 to bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    expect(scrubString(input)).toBe("Transfer from [ETH_ADDR] to [BTC_ADDR]");
  });

  it("returns strings without sensitive patterns unchanged", () => {
    const input = "Transaction completed successfully";
    expect(scrubString(input)).toBe(input);
  });
});

describe("redactData", () => {
  it("redacts known sensitive field names with identifier redaction", () => {
    const data = {
      btcAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      message: "some message",
    };
    const result = redactData(data);
    expect(result.btcAddress).toBe("bc1q...f3t4");
    expect(result.message).toBe("some message");
  });

  it("scrubs non-sensitive string fields for address patterns", () => {
    const data = {
      error: "Failed for 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
    };
    const result = redactData(data);
    expect(result.error).toBe("Failed for [ETH_ADDR]");
  });

  it("handles nested objects recursively", () => {
    const data = {
      context: {
        txHash: "a".repeat(64),
        info: "ok",
      },
    };
    const result = redactData(data) as typeof data;
    expect(result.context.txHash).toBe("aaaa...aaaa");
    expect(result.context.info).toBe("ok");
  });

  it("handles arrays", () => {
    const data = {
      addresses: ["0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80", "plain text"],
    };
    const result = redactData(data);
    expect(result.addresses).toEqual(["[ETH_ADDR]", "plain text"]);
  });

  it("returns null and undefined unchanged", () => {
    expect(redactData(null)).toBeNull();
    expect(redactData(undefined)).toBeUndefined();
  });

  it("returns numbers and booleans unchanged", () => {
    expect(redactData(42)).toBe(42);
    expect(redactData(true)).toBe(true);
  });

  it("extracts and scrubs Error message instead of returning empty object", () => {
    const err = new Error(
      "Failed for 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
    );
    const result = redactData({ error: err }) as { error: { message: string } };
    expect(result.error).toEqual({ message: "Failed for [ETH_ADDR]" });
  });

  it("redacts short sensitive field values with [REDACTED]", () => {
    const data = { address: "0x1", publicKey: "abc", mnemonic: "word" };
    const result = redactData(data);
    expect(result.address).toBe("[REDACTED]");
    expect(result.publicKey).toBe("[REDACTED]");
    expect(result.mnemonic).toBe("[REDACTED]");
  });
});

describe("scrubSentryEvent", () => {
  it("scrubs exception values", () => {
    const event: SentryEvent = {
      exception: {
        values: [
          {
            type: "Error",
            value: "Failed for 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
          },
        ],
      },
    };
    const result = scrubSentryEvent(event);
    expect(result.exception?.values?.[0].value).toBe("Failed for [ETH_ADDR]");
  });

  it("scrubs event message", () => {
    const event: SentryEvent = {
      message: "Error at bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    };
    const result = scrubSentryEvent(event);
    expect(result.message).toBe("Error at [BTC_ADDR]");
  });

  it("scrubs extra context", () => {
    const event: SentryEvent = {
      extra: {
        ethAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
      },
    };
    const result = scrubSentryEvent(event);
    expect(result.extra?.ethAddress).toBe("0x74...bD80");
  });

  it("scrubs breadcrumb messages and data", () => {
    const event: SentryEvent = {
      breadcrumbs: [
        {
          message: "RPC call to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
          data: {
            txHex: "deadbeef".repeat(16),
          },
        },
      ],
    };
    const result = scrubSentryEvent(event);
    expect(result.breadcrumbs?.[0].message).toBe("RPC call to [ETH_ADDR]");
    expect(result.breadcrumbs?.[0].data?.txHex).toBe("dead...beef");
  });

  it("scrubs request URL", () => {
    const event: SentryEvent = {
      request: {
        url: "https://rpc.example.com/0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
      },
    };
    const result = scrubSentryEvent(event);
    expect(result.request?.url).toBe("https://rpc.example.com/[ETH_ADDR]");
  });

  it("scrubs tags containing sensitive data", () => {
    const event: SentryEvent = {
      tags: {
        contract: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
        environment: "staging",
      },
    };
    const result = scrubSentryEvent(event);
    expect(result.tags?.contract).toBe("[ETH_ADDR]");
    expect(result.tags?.environment).toBe("staging");
  });

  it("preserves non-sensitive event fields", () => {
    const event: SentryEvent = {
      message: "Something went wrong",
      level: "error",
      extra: { version: "1.0.0" },
    };
    const result = scrubSentryEvent(event);
    expect(result.message).toBe("Something went wrong");
    expect(result.level).toBe("error");
    expect(result.extra?.version).toBe("1.0.0");
  });

  it("scrubs stack frame filename, abs_path, module, and vars", () => {
    const event: SentryEvent = {
      exception: {
        values: [
          {
            type: "Error",
            value: "something failed",
            stacktrace: {
              frames: [
                {
                  filename: "/app/0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80/index.js",
                  abs_path: "/abs/0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80/index.js",
                  module: "module.0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80",
                  vars: {
                    depositorBtcPubkey: "a".repeat(64),
                    localVar: "safe value",
                  },
                },
                {
                  filename: "safe-file.js",
                  abs_path: undefined,
                  module: undefined,
                },
              ],
            },
          },
        ],
      },
    };
    const result = scrubSentryEvent(event);
    const frames = result.exception?.values?.[0].stacktrace?.frames;

    expect(frames?.[0].filename).toBe("/app/[ETH_ADDR]/index.js");
    expect(frames?.[0].abs_path).toBe("/abs/[ETH_ADDR]/index.js");
    expect(frames?.[0].module).toBe("module.[ETH_ADDR]");
    expect(frames?.[0].vars?.depositorBtcPubkey).toBe("aaaa...aaaa");
    expect(frames?.[0].vars?.localVar).toBe("safe value");

    expect(frames?.[1].filename).toBe("safe-file.js");
    expect(frames?.[1].abs_path).toBeUndefined();
    expect(frames?.[1].module).toBeUndefined();
  });
});
