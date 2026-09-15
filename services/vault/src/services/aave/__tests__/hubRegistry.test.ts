import { describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

import { logger } from "@/infrastructure";

import { buildHubRegistry, getHubIdentity } from "../hubRegistry";

const DEVNET_BABYLON_HUB = "0xb3283508a0E96F80CF79DC2a1135F10dA170138D";
const DEVNET_CORE_HUB = "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca";

describe("getHubIdentity", () => {
  it("labels a registered hub from the registry", () => {
    expect(getHubIdentity(DEVNET_CORE_HUB)).toEqual({
      source: "registry",
      address: DEVNET_CORE_HUB,
      label: "Core Hub",
    });
  });

  it("matches a registered hub regardless of address case", () => {
    expect(
      getHubIdentity("0xb3283508a0e96f80cf79dc2a1135f10da170138d").label,
    ).toBe("Babylon Hub");
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

describe("buildHubRegistry", () => {
  it("builds the deployed registry without a duplicate label or address", () => {
    expect(getHubIdentity(DEVNET_BABYLON_HUB).label).not.toBe(
      getHubIdentity(DEVNET_CORE_HUB).label,
    );
  });

  it("rejects two hubs sharing a label within one deployment", () => {
    expect(() =>
      buildHubRegistry({
        devnet: {
          [DEVNET_BABYLON_HUB]: "Babylon Hub",
          [DEVNET_CORE_HUB]: "Babylon Hub",
        },
      }),
    ).toThrow('Hub label "Babylon Hub" is used twice in deployment devnet');
  });

  it("allows the same label in different deployments", () => {
    const registry = buildHubRegistry({
      devnet: { [DEVNET_BABYLON_HUB]: "Babylon Hub" },
      mainnet: { [DEVNET_CORE_HUB]: "Babylon Hub" },
    });

    expect(registry.size).toBe(2);
  });

  it("rejects one address registered twice", () => {
    expect(() =>
      buildHubRegistry({
        devnet: { [DEVNET_BABYLON_HUB]: "Babylon Hub" },
        testnet: {
          [DEVNET_BABYLON_HUB.toLowerCase()]: "Core Hub",
        },
      }),
    ).toThrow(`Hub ${DEVNET_BABYLON_HUB} is registered more than once`);
  });
});
