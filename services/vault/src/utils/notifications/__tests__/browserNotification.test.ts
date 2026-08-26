import { afterEach, describe, expect, it, vi } from "vitest";

import { requestBrowserNotificationPermission } from "../browserNotification";

// jsdom has no Notification API; install a minimal typed stub per test.
type RequestPermission = typeof window.Notification.requestPermission;

function stubNotification(stub: {
  permission: NotificationPermission;
  requestPermission: RequestPermission;
}) {
  (window as unknown as { Notification: typeof stub }).Notification = stub;
}

describe("requestBrowserNotificationPermission", () => {
  afterEach(() => {
    delete (window as unknown as { Notification?: unknown }).Notification;
  });

  it("returns null when the Notification API is unavailable", async () => {
    delete (window as unknown as { Notification?: unknown }).Notification;

    await expect(requestBrowserNotificationPermission()).resolves.toBeNull();
  });

  it("short-circuits without prompting when permission is already decided", async () => {
    const requestPermission = vi.fn();
    stubNotification({
      permission: "denied",
      requestPermission: requestPermission as unknown as RequestPermission,
    });

    await expect(requestBrowserNotificationPermission()).resolves.toBe(
      "denied",
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("resolves the granted value from the modern Promise form", async () => {
    const requestPermission = vi.fn(
      async () => "granted" as NotificationPermission,
    );
    stubNotification({
      permission: "default",
      requestPermission: requestPermission as unknown as RequestPermission,
    });

    await expect(requestBrowserNotificationPermission()).resolves.toBe(
      "granted",
    );
  });

  it("resolves the granted value from Safari's legacy callback form (returns undefined)", async () => {
    // Pre-16 Safari: requestPermission ignores its return value and delivers
    // the result only by invoking the callback argument.
    const requestPermission = vi.fn(
      (cb?: (permission: NotificationPermission) => void) => {
        cb?.("granted");
        return undefined;
      },
    );
    stubNotification({
      permission: "default",
      requestPermission: requestPermission as unknown as RequestPermission,
    });

    await expect(requestBrowserNotificationPermission()).resolves.toBe(
      "granted",
    );
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("falls back to current permission when the modern Promise rejects", async () => {
    // Some engines reject requestPermission (e.g. insecure context). The
    // wrapper must still settle - to the current permission - rather than
    // hang and leave the consumer's permission state stale.
    const requestPermission = vi.fn(async () => {
      throw new Error("insecure context");
    });
    stubNotification({
      permission: "default",
      requestPermission: requestPermission as unknown as RequestPermission,
    });

    await expect(requestBrowserNotificationPermission()).resolves.toBe(
      "default",
    );
  });
});
