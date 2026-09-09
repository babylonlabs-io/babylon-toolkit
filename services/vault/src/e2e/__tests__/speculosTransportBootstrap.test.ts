/**
 * The E2E-only Speculos transport bootstrap (#2110): with the env flag unset
 * it must be a provable no-op (production path); with it set it must arm the
 * signer package's transport seam with the Speculos factory before any
 * connect can build the DMK.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fakeFactory = { tag: "speculos-factory" };
  return {
    fakeFactory,
    setDmkTransportOverride: vi.fn(),
    speculosTransportFactory: vi.fn(() => fakeFactory),
  };
});
const { fakeFactory, setDmkTransportOverride, speculosTransportFactory } = h;

vi.mock("@babylonlabs-io/ledger-vault-signer", () => ({
  setDmkTransportOverride: h.setDmkTransportOverride,
}));
vi.mock("@ledgerhq/device-transport-kit-speculos", () => ({
  speculosTransportFactory: h.speculosTransportFactory,
  speculosIdentifier: "SPECULOS-ID",
}));
vi.mock("@ledgerhq/device-management-kit", () => ({
  DeviceModelId: { NANO_SP: "nanoSP-mock" },
}));

import { initSpeculosTransportForE2E } from "../speculosTransportBootstrap";

describe("initSpeculosTransportForE2E", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setDmkTransportOverride.mockClear();
    speculosTransportFactory.mockClear();
  });

  it("returns undefined and arms nothing when the env flag is unset — the production path", () => {
    // Explicit: the invoking shell may export the flag (a local Speculos
    // session does exactly that) — the getter maps "" to undefined.
    vi.stubEnv("NEXT_PUBLIC_TBV_E2E_SPECULOS_URL", "");

    expect(initSpeculosTransportForE2E()).toBeUndefined();
    expect(setDmkTransportOverride).not.toHaveBeenCalled();
  });

  it("arms the seam with the Speculos factory for the configured URL when the flag is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_TBV_E2E_SPECULOS_URL", "http://127.0.0.1:5055");

    await initSpeculosTransportForE2E();

    // isE2E=true (skips the transport's unclearable disconnect watcher) and
    // the nanosp model the container runs — same shape as the signer's own
    // DMK-over-Speculos e2e.
    expect(speculosTransportFactory).toHaveBeenCalledWith(
      "http://127.0.0.1:5055",
      true,
      "nanoSP-mock",
    );
    expect(setDmkTransportOverride).toHaveBeenCalledWith({
      transportFactory: fakeFactory,
      transportIdentifier: "SPECULOS-ID",
    });
  });
});
