/**
 * Tests for useLogger automatic redaction functionality.
 * Since useLogger is a React hook, we test the underlying logger object and redaction logic directly.
 */

// Mock Sentry first, before importing anything else
const mockAddBreadcrumb = jest.fn();
const mockCaptureException = jest.fn(() => "mock-event-id");

jest.mock("@sentry/react", () => ({
  addBreadcrumb: mockAddBreadcrumb,
  captureException: mockCaptureException,
}));

// Mock React to avoid hook call errors in tests
jest.mock("react", () => ({
  useMemo: jest.fn((fn) => fn()),
}));

// Mock the telemetry utility to simulate redaction
const mockRedactTelemetry = jest.fn((value: string | undefined | null) => {
  if (!value) return "";
  // Simulate redaction: show first 4 and last 4 chars
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
});

jest.mock("@/ui/common/utils/telemetry", () => ({
  redactTelemetry: mockRedactTelemetry,
}));

jest.mock("@/ui/common/errors", () => ({
  ClientError: class ClientError extends Error {
    errorCode: string;
    constructor(errorCode: string, message: string) {
      super(message);
      this.errorCode = errorCode;
    }
  },
}));

// Import after all mocks are set up
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require("@/ui/common/hooks/useLogger");

describe("Logger auto-redaction", () => {
  const logger = loggerModule.useLogger();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("info", () => {
    it("logs info without redacting non-sensitive fields", () => {
      logger.info("Test message", {
        category: "test",
        regularField: "regular value",
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Test message",
        category: "test",
        data: {
          regularField: "regular value",
        },
      });
      expect(mockRedactTelemetry).not.toHaveBeenCalled();
    });

    it("automatically redacts bech32Address", () => {
      const address = "bbn1qwertyuiopasdfghjklzxcvbnm123456789";
      logger.info("Test message", {
        bech32Address: address,
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(address);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Test message",
        category: undefined,
        data: {
          bech32Address: "bbn1...6789",
        },
      });
    });

    it("automatically redacts btcAddress", () => {
      const address = "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9";
      logger.info("Test message", {
        btcAddress: address,
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(address);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Test message",
        category: undefined,
        data: {
          btcAddress: "bc1q...a8b9",
        },
      });
    });

    it("automatically redacts babylonAddress", () => {
      const address = "babylon1qwertyuiopasdfghjklzxcvbnm123456789";
      logger.info("Test message", {
        babylonAddress: address,
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(address);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Test message",
        category: undefined,
        data: {
          babylonAddress: "baby...6789",
        },
      });
    });

    it("automatically redacts userPublicKey", () => {
      const pubkey = "02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";
      logger.info("Test message", {
        userPublicKey: pubkey,
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(pubkey);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Test message",
        category: undefined,
        data: {
          userPublicKey: "02a1...e3f4",
        },
      });
    });

    it("redacts nested sensitive fields", () => {
      const address = "bbn1qwertyuiopasdfghjklzxcvbnm123456789";
      logger.info("Test message", {
        tags: {
          bech32Address: address,
          app: "baby",
        },
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(address);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Test message",
        category: undefined,
        data: {
          tags: {
            bech32Address: "bbn1...6789",
            app: "baby",
          },
        },
      });
    });

    it("redacts sensitive fields in arrays", () => {
      const addr1 = "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9";
      const addr2 = "bc1q9876543210abcdefghijklmnopqrstuvwxyz123";
      logger.info("Test message", {
        addresses: [{ btcAddress: addr1 }, { btcAddress: addr2 }],
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(addr1);
      expect(mockRedactTelemetry).toHaveBeenCalledWith(addr2);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Test message",
        category: undefined,
        data: {
          addresses: [
            { btcAddress: "bc1q...a8b9" },
            { btcAddress: "bc1q...z123" },
          ],
        },
      });
    });
  });

  describe("warn", () => {
    it("logs warning with automatic redaction", () => {
      const address = "bbn1qwertyuiopasdfghjklzxcvbnm123456789";
      logger.warn("Warning message", {
        bech32Address: address,
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(address);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "warning",
        message: "Warning message",
        category: undefined,
        data: {
          bech32Address: "bbn1...6789",
        },
      });
    });
  });

  describe("error", () => {
    it("captures exception with redacted tags", () => {
      const error = new Error("Test error");
      const address = "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9";
      logger.error(error, {
        tags: {
          btcAddress: address,
        },
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(address);
      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        level: "error",
        tags: {
          btcAddress: "bc1q...a8b9",
        },
        extra: undefined,
      });
    });

    it("captures exception with redacted extra data", () => {
      const error = new Error("Test error");
      const pubkey = "02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";
      logger.error(error, {
        data: {
          userPublicKey: pubkey,
        },
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(pubkey);
      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        level: "error",
        tags: undefined,
        extra: {
          userPublicKey: "02a1...e3f4",
        },
      });
    });

    it("includes errorCode for ClientError with redacted tags", () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ClientError } = require("@/ui/common/errors");
      const error = new ClientError(
        "WALLET_NOT_CONNECTED",
        "Wallet not connected",
      );
      const address = "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9";

      logger.error(error, {
        tags: {
          btcAddress: address,
        },
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(address);
      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        level: "error",
        tags: {
          btcAddress: "bc1q...a8b9",
          errorCode: "WALLET_NOT_CONNECTED",
        },
        extra: undefined,
      });
    });
  });

  describe("multiple sensitive fields", () => {
    it("redacts multiple sensitive fields at once", () => {
      const btcAddress = "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9";
      const babylonAddress = "babylon1qwertyuiopasdfghjklzxcvbnm123456789";
      const userPublicKey =
        "02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";

      logger.info("Multiple addresses", {
        btcAddress,
        babylonAddress,
        userPublicKey,
        network: "mainnet",
      });

      expect(mockRedactTelemetry).toHaveBeenCalledWith(btcAddress);
      expect(mockRedactTelemetry).toHaveBeenCalledWith(babylonAddress);
      expect(mockRedactTelemetry).toHaveBeenCalledWith(userPublicKey);

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        level: "info",
        message: "Multiple addresses",
        category: undefined,
        data: {
          btcAddress: "bc1q...a8b9",
          babylonAddress: "baby...6789",
          userPublicKey: "02a1...e3f4",
          network: "mainnet",
        },
      });
    });
  });
});
