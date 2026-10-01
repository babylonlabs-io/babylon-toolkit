import { addBreadcrumb, captureException, captureMessage } from "@sentry/react";
import { describe, expect, it, vi } from "vitest";

import logger from "../logger";

vi.mock("@sentry/react", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const ETH_ADDR = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80";
const LONG_HEX = "a".repeat(64);

describe("logger", () => {
  describe("info", () => {
    it("scrubs sensitive patterns from message", () => {
      logger.info(`Transfer to ${ETH_ADDR}`);

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "info",
          message: "Transfer to [ETH_ADDR]",
        }),
      );
    });

    it("redacts known sensitive fields in data", () => {
      logger.info("pegin created", {
        btcAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        status: "pending",
      });

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            btcAddress: "bc1q...f3t4",
            status: "pending",
          }),
        }),
      );
    });

    it("scrubs address patterns in non-sensitive data fields", () => {
      logger.info("call failed", {
        error: `Contract ${ETH_ADDR} reverted`,
      });

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            error: "Contract [ETH_ADDR] reverted",
          }),
        }),
      );
    });
  });

  describe("warn", () => {
    it("scrubs message and data", () => {
      logger.warn(`Failed for ${ETH_ADDR}`, {
        txHash: LONG_HEX,
      });

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "warning",
          message: "Failed for [ETH_ADDR]",
          data: expect.objectContaining({
            txHash: "aaaa...aaaa",
          }),
        }),
      );
    });
  });

  describe("error", () => {
    it("logs the message of a plain-object rejection without its payload", () => {
      const message = "Current keyring does not support deriveContextHash";
      logger.error({
        code: -32603,
        message,
        data: { originalError: { message, stack: LONG_HEX } },
      });

      const error = vi.mocked(captureException).mock.lastCall?.[0];
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty("message", message);
      expect(error).not.toHaveProperty("data");
      expect(error).not.toHaveProperty("cause");
      expect((error as Error).stack).not.toContain(LONG_HEX);
    });

    it("scrubs addresses and hex in a plain-object rejection in the console", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      logger.error({ message: `Failed for ${ETH_ADDR}: ${LONG_HEX}` });

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("Failed for [ETH_ADDR]: [HEX_REDACTED]"),
      );
      consoleError.mockRestore();
    });

    it("redacts extra data", () => {
      const error = new Error("something failed");
      logger.error(error, {
        data: {
          ethAddress: ETH_ADDR,
          info: "some context",
        },
      });

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({
            ethAddress: "0x74...bD80",
            info: "some context",
          }),
        }),
      );
    });

    it("tags a numeric errorCode as a string", () => {
      logger.error({ message: "fail", errorCode: 7 });

      expect(captureException).toHaveBeenLastCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { errorCode: "7" } }),
      );
    });

    it("adds no errorCode tag when errorCode is not a string or number", () => {
      const error = Object.assign(new Error("fail"), { errorCode: undefined });
      logger.error(error);

      expect(captureException).toHaveBeenLastCalledWith(
        error,
        expect.objectContaining({ tags: undefined }),
      );
    });

    it("passes undefined extra through unchanged", () => {
      const error = new Error("fail");
      logger.error(error);

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: undefined,
        }),
      );
    });
  });

  describe("event", () => {
    it("scrubs message and redacts extra data", () => {
      logger.event(`Deposit from ${ETH_ADDR}`, {
        txHex: LONG_HEX,
      });

      expect(captureMessage).toHaveBeenCalledWith(
        "Deposit from [ETH_ADDR]",
        expect.objectContaining({
          extra: expect.objectContaining({
            txHex: "aaaa...aaaa",
          }),
        }),
      );
    });

    it("forwards tags to captureMessage and keeps them out of extra", () => {
      logger.event("deposit.registered", {
        level: "info",
        tags: { vaultId: "0x11...2222", providerId: "0xab...cdef" },
        batchId: "batch-1",
      });

      // `extra` is matched exactly (not `objectContaining`) so the absence of a
      // `tags` key inside it is a real assertion, not a vacuous one.
      expect(captureMessage).toHaveBeenCalledWith(
        "deposit.registered",
        expect.objectContaining({
          tags: { vaultId: "0x11...2222", providerId: "0xab...cdef" },
          extra: { batchId: "batch-1" },
        }),
      );
    });
  });
});
