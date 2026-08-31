/**
 * Tests for the DMK session lifecycle. The DMK packages are mocked because
 * they require WebHID and a physical device; what is under test is our
 * lifecycle policy, not Ledger's transport.
 */

import type { TransportFactory } from "@ledgerhq/device-management-kit";
import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The mocked modules' own values, asserted against below.
import { GetAppAndVersionCommand } from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";

const built = vi.hoisted(() => ({
  count: 0,
  transports: [] as unknown[],
  instances: [] as object[],
  closed: [] as object[],
  /** Fires inside a build, after its dynamic imports and before `build()`. */
  onBuilding: undefined as (() => void) | undefined,
}));
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
    addTransport(factory: unknown) {
      built.transports.push(factory);
      built.onBuilding?.();
      return this;
    }
    build() {
      built.count += 1;
      // Per-build identity, methods falling through to dmkStub's fns — the
      // race tests must tell the orphaned instance from the survivor.
      const instance: object = Object.create(dmkStub);
      built.instances.push(instance);
      return instance;
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

import {
  closeDmk,
  connectDmkSession,
  disconnectDmkSession,
  isSessionAlive,
  setDmkTransportOverride,
} from "../dmkSession";

const DEVICE = { id: "device-1" };

/** A closed DMK is disposed; using one is a bug a no-op `close()` would hide. */
function assertNotDisposed(instance: object, call: string): void {
  if (built.closed.includes(instance)) throw new Error(`DMK.${call} called after close()`);
}

beforeEach(() => {
  built.count = 0;
  built.transports.length = 0;
  built.instances.length = 0;
  built.closed.length = 0;
  built.onBuilding = undefined;
  vi.clearAllMocks();
  dmkStub.close.mockImplementation(function (this: object) {
    built.closed.push(this);
  });
  dmkStub.startDiscovering.mockImplementation(function (this: object) {
    assertNotDisposed(this, "startDiscovering");
    return of(DEVICE);
  });
  dmkStub.connect.mockImplementation(async function (this: object) {
    assertNotDisposed(this, "connect");
    return "session-1";
  });
  dmkStub.sendCommand.mockResolvedValue({
    status: "SUCCESS",
    data: { name: "Babylon Vault Testnet", version: "0.9.4" },
  });
});

afterEach(() => {
  // closeDmk first: the setter refuses to touch a live singleton.
  closeDmk();
  setDmkTransportOverride(undefined);
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
    await Promise.all([connectDmkSession(), connectDmkSession()]);

    expect(built.count).toBe(1);
  });

  it("runs both concurrent preflights against one shared DMK module import", async () => {
    // Two in-flight import()s of the mocked DMK from dmkSession resolve the
    // loser to the REAL package under vitest — its preflight then constructs
    // the real command (191 inlined files; the CI timeout behind this test).
    await Promise.all([connectDmkSession(), connectDmkSession()]);

    const commands = dmkStub.sendCommand.mock.calls.map(([call]) => call.command);
    expect(commands).toHaveLength(2);
    expect(commands.every((command) => command instanceof GetAppAndVersionCommand)).toBe(true);
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

describe("setDmkTransportOverride", () => {
  // The mock DMK never invokes the factory; identity is all these tests need.
  const fakeTransportFactory: TransportFactory = () => {
    throw new Error("unit tests never invoke the transport factory");
  };
  const FAKE_IDENTIFIER = "FAKE-SPECULOS";

  it("builds the DMK over the injected factory and discovers on its identifier", async () => {
    setDmkTransportOverride({ transportFactory: fakeTransportFactory, transportIdentifier: FAKE_IDENTIFIER });

    await connectDmkSession();

    expect(built.transports).toEqual([fakeTransportFactory]);
    expect(dmkStub.startDiscovering).toHaveBeenCalledWith({ transport: FAKE_IDENTIFIER });
  });

  it("keeps the web-hid factory and identifier when nothing is injected", async () => {
    // Pins the default path: the seam must not perturb production behavior.
    await connectDmkSession();

    expect(built.transports).toEqual([webHidTransportFactory]);
    expect(dmkStub.startDiscovering).toHaveBeenCalledWith({ transport: "WEB-HID" });
  });

  it("throws once the DMK singleton exists — transports register at build time", async () => {
    await connectDmkSession();

    expect(() =>
      setDmkTransportOverride({ transportFactory: fakeTransportFactory, transportIdentifier: FAKE_IDENTIFIER }),
    ).toThrow(/closeDmk/);
  });

  it("throws while a build is still in flight — the promise memo is claimed synchronously", async () => {
    const pending = connectDmkSession();

    expect(() =>
      setDmkTransportOverride({ transportFactory: fakeTransportFactory, transportIdentifier: FAKE_IDENTIFIER }),
    ).toThrow(/closeDmk/);

    await pending;
  });

  it("clearing the override after closeDmk restores the web-hid default", async () => {
    setDmkTransportOverride({ transportFactory: fakeTransportFactory, transportIdentifier: FAKE_IDENTIFIER });
    await connectDmkSession();
    closeDmk();
    built.transports.length = 0;

    setDmkTransportOverride(undefined);
    await connectDmkSession();

    expect(built.transports).toEqual([webHidTransportFactory]);
    expect(dmkStub.startDiscovering).toHaveBeenLastCalledWith({ transport: "WEB-HID" });
  });
});

describe("closeDmk landing inside a build's await window", () => {
  // closeDmk() clears the promise memo, which lifts the setter's guard — so a
  // transport swap can land while a build is still suspended on its imports.
  const lateTransportFactory: TransportFactory = () => {
    throw new Error("unit tests never invoke the transport factory");
  };
  const LATE_IDENTIFIER = "LATE-SPECULOS";

  it("fails the abandoned connect, and the next one builds and discovers over the late-injected transport", async () => {
    const abandoned = connectDmkSession();

    closeDmk();
    setDmkTransportOverride({ transportFactory: lateTransportFactory, transportIdentifier: LATE_IDENTIFIER });
    // A torn-down DMK cannot serve this caller — handing it back would run
    // discovery on a disposed instance.
    await expect(abandoned).rejects.toThrow(/closeDmk/);

    const handle = await connectDmkSession();

    // Per-build snapshot, stated positively: the late override is the NEXT
    // build's transport, and that build discovers on its own identifier.
    expect(built.transports).toEqual([webHidTransportFactory, lateTransportFactory]);
    expect(dmkStub.startDiscovering).toHaveBeenCalledWith({ transport: LATE_IDENTIFIER });
    expect(handle.sessionId).toBe("session-1");
  });

  it("never closes the abandoned build's DMK — it holds no transport, and close() would construct one", async () => {
    const abandoned = connectDmkSession();

    closeDmk();
    setDmkTransportOverride({ transportFactory: lateTransportFactory, transportIdentifier: LATE_IDENTIFIER });
    await expect(abandoned).rejects.toThrow(/closeDmk/);

    // `build()` only stores the factory, and the orphan never reached a use
    // case — so it has nothing to release and close() would only add listeners.
    expect(built.closed).toHaveLength(0);

    const liveHandle = await connectDmkSession();
    expect(built.count).toBe(2);
    expect(liveHandle.dmk).not.toBe(built.instances[0]);

    closeDmk();

    // …and closeDmk() still reaches the LIVE instance, which does hold one.
    expect(built.closed).toHaveLength(1);
    expect(built.closed[0]).toBe(liveHandle.dmk);
  });

  it("an abandoned build's failure leaves the memo of the build that replaced it intact", async () => {
    // Replace the memo from INSIDE the first build, once it is past its
    // dynamic imports: two builds importing concurrently trips vitest's own
    // mock registry, and that race is not the behavior under test.
    let live: ReturnType<typeof connectDmkSession> | undefined;
    built.onBuilding = () => {
      built.onBuilding = undefined;
      closeDmk();
      live = connectDmkSession();
    };

    const abandoned = connectDmkSession();

    await expect(abandoned).rejects.toThrow(/closeDmk/);
    const liveHandle = await live;

    // The build's catch clears the memo only while it still owns it, so the
    // abandoned one must not wipe its successor's: a third connect reuses it.
    const reused = await connectDmkSession();
    expect(built.count).toBe(2);
    expect(reused.dmk).toBe(liveHandle?.dmk);
  });
});
