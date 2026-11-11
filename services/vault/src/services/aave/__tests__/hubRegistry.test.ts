import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

import { logger } from "@/infrastructure";
import { BABYLON_HUB, CORE_HUB } from "@/test/deploymentAddresses";

import { getHubIdentity } from "../hubRegistry";

describe("getHubIdentity", () => {
  it("labels the profile's aaveHubStables as the Core Hub", () => {
    expect(getHubIdentity(CORE_HUB)).toEqual({
      source: "registry",
      address: CORE_HUB,
      label: "Core Hub",
    });
  });

  it("labels the profile's aaveHub as the Babylon Hub, regardless of address case", () => {
    expect(getHubIdentity(BABYLON_HUB.toLowerCase() as Address).label).toBe(
      "Babylon Hub",
    );
  });

  it("shows an unregistered hub by its short checksummed address", () => {
    expect(
      getHubIdentity("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"),
    ).toEqual({
      source: "address",
      address: "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD",
      label: "0xABcd...abCD",
    });
  });

  it("warns once per unregistered hub, not on every lookup", () => {
    const unknownHub = "0x1111111111111111111111111111111111111111";

    getHubIdentity(unknownHub);
    getHubIdentity(unknownHub);

    expect(
      vi
        .mocked(logger.warn)
        .mock.calls.filter(([message]) => message.includes(unknownHub)),
    ).toHaveLength(1);
  });
});
