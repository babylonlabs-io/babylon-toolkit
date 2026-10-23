import { isDepositNotAllowedError } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadDepositorAllowed, mockLoggerEvent } = vi.hoisted(() => ({
  mockReadDepositorAllowed: vi.fn(),
  mockLoggerEvent: vi.fn(),
}));

vi.mock("@/clients/eth-contract/allow-list-policy", () => ({
  readDepositorAllowed: mockReadDepositorAllowed,
}));

vi.mock("@/infrastructure", () => ({
  logger: { event: mockLoggerEvent },
}));

import { TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";

import { assertDepositorAllowListed } from "../depositorAllowList";

const ENTRY_POINT = "0x1111111111111111111111111111111111111111" as Address;
const DEPOSITOR = "0x2222222222222222222222222222222222222222" as Address;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertDepositorAllowListed", () => {
  it("lets a listed depositor through after asking about that depositor and application", async () => {
    mockReadDepositorAllowed.mockResolvedValue(true);

    await expect(
      assertDepositorAllowListed({
        applicationEntryPoint: ENTRY_POINT,
        depositor: DEPOSITOR,
      }),
    ).resolves.toBeUndefined();
    expect(mockReadDepositorAllowed).toHaveBeenCalledWith({
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
    });
  });

  it("refuses an unlisted depositor with the typed allow-list error", async () => {
    mockReadDepositorAllowed.mockResolvedValue(false);

    const err = await assertDepositorAllowListed({
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
    }).catch((e: unknown) => e);

    expect(isDepositNotAllowedError(err)).toBe(true);
    expect(mockLoggerEvent).not.toHaveBeenCalled();
  });

  it("lets the deposit continue and reports it when the allow-list cannot be read", async () => {
    mockReadDepositorAllowed.mockRejectedValue(new Error("rpc unavailable"));

    await expect(
      assertDepositorAllowListed({
        applicationEntryPoint: ENTRY_POINT,
        depositor: DEPOSITOR,
      }),
    ).resolves.toBeUndefined();
    expect(mockLoggerEvent).toHaveBeenCalledWith(
      TELEMETRY_EVENT.DEPOSIT_ALLOW_LIST_UNREADABLE,
      expect.objectContaining({ level: "warning", error: "rpc unavailable" }),
    );
  });
});
