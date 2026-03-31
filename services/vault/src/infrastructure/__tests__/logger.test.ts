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
  });
});
