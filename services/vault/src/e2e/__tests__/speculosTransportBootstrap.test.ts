/**
 * The E2E-only Speculos transport bootstrap (#2110): the unset path must be a
 * provable no-op that never touches the test kits, the armed path must wire
 * the seam exactly, and a failed arm must reject (main.tsx renders the app
 * with a diagnostic) while reporting NOT armed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fakeFactory = { tag: "speculos-factory" };
  return {
    fakeFactory,
    setDmkTransportOverride: vi.fn(),
    speculosTransportFactory: vi.fn(() => fakeFactory),
    speculosKitLoaded: vi.fn(),
    dmkKitLoaded: vi.fn(),
  };
});
const { fakeFactory, setDmkTransportOverride, speculosTransportFactory } = h;

vi.mock("@babylonlabs-io/ledger-vault-signer/testing", () => ({
  setDmkTransportOverride: h.setDmkTransportOverride,
}));
vi.mock("@ledgerhq/device-transport-kit-speculos", () => {
  h.speculosKitLoaded();
  return {
    speculosTransportFactory: h.speculosTransportFactory,
    speculosIdentifier: "SPECULOS-ID",
  };
});
vi.mock("@ledgerhq/device-management-kit", () => {
  h.dmkKitLoaded();
  return { DeviceModelId: { NANO_SP: "nanoSP-mock" } };
});

import {
  initSpeculosTransportForE2E,
  isSpeculosTransportArmed,
} from "../speculosTransportBootstrap";

const FLAG = "NEXT_PUBLIC_TBV_E2E_SPECULOS_URL";

describe("initSpeculosTransportForE2E", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setDmkTransportOverride.mockClear();
    speculosTransportFactory.mockClear();
    h.speculosKitLoaded.mockClear();
    h.dmkKitLoaded.mockClear();
  });

  it("returns undefined with the env var genuinely ABSENT — the production path", () => {
    // Truly absent, not empty: with the var unset the env plugin emits no
    // define at all, so this is the branch production actually takes.
    const saved = process.env[FLAG];
    delete process.env[FLAG];
    try {
      expect(initSpeculosTransportForE2E()).toBeUndefined();
      expect(setDmkTransportOverride).not.toHaveBeenCalled();
    } finally {
      if (saved !== undefined) process.env[FLAG] = saved;
    }
  });

  it("treats an empty or whitespace value as unset", () => {
    vi.stubEnv(FLAG, "   ");
    expect(initSpeculosTransportForE2E()).toBeUndefined();
    expect(setDmkTransportOverride).not.toHaveBeenCalled();
  });

  it("never loads either @ledgerhq kit on the unset path — pins the imports-nothing claim", () => {
    vi.stubEnv(FLAG, "");
    initSpeculosTransportForE2E();
    expect(h.speculosKitLoaded).not.toHaveBeenCalled();
    expect(h.dmkKitLoaded).not.toHaveBeenCalled();
  });

  it("rejects a non-localhost URL (the page CSP would silently block its fetches)", async () => {
    vi.stubEnv(FLAG, "http://127.0.0.1:5055");
    await expect(initSpeculosTransportForE2E()).rejects.toThrow(/localhost/);
    expect(setDmkTransportOverride).not.toHaveBeenCalled();
    expect(isSpeculosTransportArmed()).toBe(false);
  });

  it("rejects (never throws synchronously) on garbage, so main.tsx can degrade to a rendered app", async () => {
    vi.stubEnv(FLAG, "not a url");
    const result = initSpeculosTransportForE2E();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow(/not a URL/);
    expect(setDmkTransportOverride).not.toHaveBeenCalled();
    expect(isSpeculosTransportArmed()).toBe(false);
  });
  it("reports NOT armed and rejects when the seam call itself throws — the configured-but-unarmed gate case", async () => {
    vi.stubEnv(FLAG, "http://localhost:5055");
    setDmkTransportOverride.mockImplementationOnce(() => {
      throw new Error("DMK already built");
    });
    await expect(initSpeculosTransportForE2E()).rejects.toThrow(
      /DMK already built/,
    );
    expect(isSpeculosTransportArmed()).toBe(false);
  });

  // LAST on purpose: `armed` is module state with no reset — every
  // not-armed assertion above must run before the one test that arms it.
  it("arms the seam with the Speculos factory for a localhost URL and reports armed", async () => {
    vi.stubEnv(FLAG, "http://localhost:5055");

    await initSpeculosTransportForE2E();

    // isE2E=true (skips the transport's unclearable disconnect watcher) and
    // the nanosp model the container runs — same shape as the signer's own
    // DMK-over-Speculos e2e.
    expect(speculosTransportFactory).toHaveBeenCalledWith(
      "http://localhost:5055",
      true,
      "nanoSP-mock",
    );
    expect(setDmkTransportOverride).toHaveBeenCalledWith({
      transportFactory: fakeFactory,
      transportIdentifier: "SPECULOS-ID",
    });
    expect(isSpeculosTransportArmed()).toBe(true);
  });
});
