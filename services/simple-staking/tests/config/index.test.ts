import {
  shouldDisplayTestingMsg,
  shouldRedactTelemetry,
} from "@/ui/common/config";

jest.mock("@/ui/common/constants", () => ({
  MEMPOOL_API: "https://mempool.space",
}));

describe("shouldDisplayTestingMsg", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES;
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES;
  });

  it("should return true if NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES is not set", () => {
    expect(shouldDisplayTestingMsg()).toBe(true);
  });

  it('should return true if NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES is "true"', () => {
    process.env.NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES = "true";
    expect(shouldDisplayTestingMsg()).toBe(true);
  });

  it('should return false if NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES is "false"', () => {
    process.env.NEXT_PUBLIC_DISPLAY_TESTING_MESSAGES = "false";
    expect(shouldDisplayTestingMsg()).toBe(false);
  });
});

describe("shouldRedactTelemetry", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_REDACT_TELEMETRY;
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_REDACT_TELEMETRY;
  });

  it("should return true if NEXT_PUBLIC_REDACT_TELEMETRY is not set", () => {
    expect(shouldRedactTelemetry()).toBe(true);
  });

  it('should return true if NEXT_PUBLIC_REDACT_TELEMETRY is "true"', () => {
    process.env.NEXT_PUBLIC_REDACT_TELEMETRY = "true";
    expect(shouldRedactTelemetry()).toBe(true);
  });

  it('should return false if NEXT_PUBLIC_REDACT_TELEMETRY is "false"', () => {
    process.env.NEXT_PUBLIC_REDACT_TELEMETRY = "false";
    expect(shouldRedactTelemetry()).toBe(false);
  });
});
