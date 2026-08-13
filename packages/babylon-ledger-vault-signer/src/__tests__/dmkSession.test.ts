/**
 * Tests for the DMK session lifecycle. The DMK packages are mocked because
 * they require WebHID and a physical device; what is under test is our
 * lifecycle policy, not Ledger's transport.
 */

import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Prime vitest's mock registry at file load: the module under test resolves
// these mocks via CONCURRENT dynamic imports, and the registry's interception
// races when the first resolution happens in parallel.
import "@ledgerhq/device-management-kit";
import "@ledgerhq/device-transport-kit-web-hid";

const built = vi.hoisted(() => ({ count: 0 }));
const dmkStub = vi.hoisted(() => ({
  startDiscovering: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getDeviceSessionState: vi.fn(),
  sendCommand: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@ledgerhq/device-management-kit", () => ({
  DeviceManagementKitBuilder: class {
    addTransport() {
      return this;
    }
    build() {
      built.count += 1;
      return dmkStub;
    }
  },
  GetAppAndVersionCommand: class {},
  // The real web-hid package's module scope imports this from DMK; vitest's
  // dynamic-import interception can race under concurrency and load that real
  // module, so the mock must satisfy its imports.
  GeneralDmkError: class GeneralDmkError extends Error {},
  // Mirrors DMK's discriminated union: success carries `data`, failure carries
  // `error` — the real narrowing helper keys on the status field.
  isSuccessCommandResult: (result: { status: string }) => result.status === "SUCCESS",
}));

vi.mock("@ledgerhq/device-transport-kit-web-hid", () => ({
  webHidTransportFactory: vi.fn(),
  webHidIdentifier: "WEB-HID",
}));

import { closeDmk, connectDmkSession, disconnectDmkSession, isSessionAlive } from "../dmkSession";

const DEVICE = { id: "device-1" };

beforeEach(() => {
  built.count = 0;
  vi.clearAllMocks();
  dmkStub.startDiscovering.mockReturnValue(of(DEVICE));
  dmkStub.connect.mockResolvedValue("session-1");
  dmkStub.sendCommand.mockResolvedValue({
    status: "SUCCESS",
    data: { name: "Babylon Vault Testnet", version: "0.9.4" },
  });
});

afterEach(() => {
  closeDmk();
});

describe("connectDmkSession", () => {
  it("connects with the session refresher disabled", async () => {
    // Deliberate: the refresher would inject GET_APP_AND_VERSION mid-ceremony,
    // and we do not yet know whether that nullifies a loaded vault intent.
    await connectDmkSession();

    expect(dmkStub.connect).toHaveBeenCalledWith({
      device: DEVICE,
      sessionRefresherOptions: { isRefresherDisabled: true },
    });
  });

  it("discovers over WebHID and returns the session id", async () => {
    const handle = await connectDmkSession();

    expect(dmkStub.startDiscovering).toHaveBeenCalledWith({
      transport: "WEB-HID",
    });
    expect(handle.sessionId).toBe("session-1");
  });

  it("builds exactly one DMK across repeated connects", async () => {
    // Two instances would stack duplicate transport listeners.
    await connectDmkSession();
    await connectDmkSession();

    expect(built.count).toBe(1);
  });

  it("builds exactly one DMK for CONCURRENT connects", async () => {
    // check-then-act across the builder's awaits would let both callers
    // build; the loser's transport would keep live WebHID listeners forever.
    // Warm the module cache first — vitest's mock registry itself races on
    // parallel dynamic imports, which is not the behavior under test.
    await connectDmkSession();
    closeDmk();
    built.count = 0;

    await Promise.all([connectDmkSession(), connectDmkSession()]);

    expect(built.count).toBe(1);
  });

  it("builds a fresh DMK after the singleton is closed", async () => {
    await connectDmkSession();
    closeDmk();
    await connectDmkSession();

    expect(built.count).toBe(2);
    expect(dmkStub.close).toHaveBeenCalledTimes(1);
  });

  it("reports the running app's name and version from the connect preflight", async () => {
    // The 0x6E00 wrong-app hint depends on this — "BOLOS" means the dashboard.
    const handle = await connectDmkSession();

    expect(handle.appName).toBe("Babylon Vault Testnet");
    expect(handle.appVersion).toBe("0.9.4");
  });

  it("still connects when the preflight fails — app info is diagnostics, not a gate", async () => {
    dmkStub.sendCommand.mockRejectedValue(new Error("transport hiccup"));

    const handle = await connectDmkSession();

    expect(handle.sessionId).toBe("session-1");
    expect(handle.appName).toBeUndefined();
    expect(handle.appVersion).toBeUndefined();
  });

  it("degrades to no app info on a command-level error result", async () => {
    dmkStub.sendCommand.mockResolvedValue({ status: "ERROR", error: { _tag: "SomeCommandError" } });

    const handle = await connectDmkSession();

    expect(handle.appName).toBeUndefined();
  });
});

describe("isSessionAlive", () => {
  // isSessionAlive keys on the DeviceSessionNotFound THROW, not on emitted
  // status values — any emission means alive, locked and busy included.
  it("treats DeviceSessionNotFound as dead — DMK throws rather than emitting a state", async () => {
    dmkStub.getDeviceSessionState.mockImplementation(() => {
      throw { _tag: "DeviceSessionNotFound" };
    });
    const handle = await connectDmkSession();

    await expect(isSessionAlive(handle)).resolves.toBe(false);
  });

  it("rethrows an unrelated DMK error rather than reporting a live session dead", async () => {
    dmkStub.getDeviceSessionState.mockImplementation(() => {
      throw { _tag: "SomeOtherDmkError" };
    });
    const handle = await connectDmkSession();

    await expect(isSessionAlive(handle)).rejects.toMatchObject({ _tag: "SomeOtherDmkError" });
  });

  it.each(["CONNECTED", "LOCKED", "BUSY"])(
    "reports %s as alive — the session survives a locked or busy device",
    async (deviceStatus) => {
      dmkStub.getDeviceSessionState.mockReturnValue(of({ deviceStatus }));
      const handle = await connectDmkSession();

      await expect(isSessionAlive(handle)).resolves.toBe(true);
    },
  );
});

describe("disconnectDmkSession", () => {
  it("swallows a disconnect failure — the caller wanted no live session", async () => {
    dmkStub.disconnect.mockRejectedValue(new Error("already gone"));
    const handle = await connectDmkSession();

    await expect(disconnectDmkSession(handle)).resolves.toBeUndefined();
  });

  it("leaves the DMK singleton up so the next connect reuses it", async () => {
    dmkStub.disconnect.mockResolvedValue(undefined);
    const handle = await connectDmkSession();

    await disconnectDmkSession(handle);
    await connectDmkSession();

    expect(dmkStub.close).not.toHaveBeenCalled();
    expect(built.count).toBe(1);
  });
});
