import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SigningNotificationProvider,
  useSigningNotificationOptional,
} from "../SigningNotificationContext";

// Control the feature flag per test.
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/config", () => ({
  FeatureFlags: {
    get isSigningNotificationsEnabled() {
      return flag.enabled;
    },
  },
}));

// Minimal stand-in for the Web Notifications API (jsdom has none).
class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static instances: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SigningNotificationProvider>{children}</SigningNotificationProvider>
);

const SIGNING_COPY = { title: "Signing required", body: "Sign it." };

function renderNotifier() {
  return renderHook(() => useSigningNotificationOptional(), { wrapper }).result;
}

describe("SigningNotificationContext", () => {
  beforeEach(() => {
    flag.enabled = true;
    FakeNotification.instances = [];
    FakeNotification.permission = "granted";
    FakeNotification.requestPermission.mockClear();
    (
      window as unknown as { Notification: typeof FakeNotification }
    ).Notification = FakeNotification;
    setVisibility("hidden");
  });

  afterEach(() => {
    setVisibility("visible");
  });

  it("shows a notification when the tab is hidden and permission is granted", () => {
    renderNotifier().current!.notifySigningRequired("k1", SIGNING_COPY);

    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Signing required");
  });

  it("notifies at most once per key", () => {
    const notifier = renderNotifier();

    notifier.current!.notifySigningRequired("k1", SIGNING_COPY);
    notifier.current!.notifySigningRequired("k1", SIGNING_COPY);

    expect(FakeNotification.instances).toHaveLength(1);
  });

  it("does not notify while the tab is focused", () => {
    setVisibility("visible");

    renderNotifier().current!.notifySigningRequired("k1", SIGNING_COPY);

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("does not notify when permission is not granted", () => {
    FakeNotification.permission = "default";

    renderNotifier().current!.notifySigningRequired("k1", SIGNING_COPY);

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("leaves the key unmarked when suppressed, so it can fire once shown later", () => {
    const notifier = renderNotifier();

    // Focused: suppressed, and the key must NOT be consumed.
    setVisibility("visible");
    notifier.current!.notifySigningRequired("k1", SIGNING_COPY);
    expect(FakeNotification.instances).toHaveLength(0);

    // Tab away: the same key now fires.
    setVisibility("hidden");
    notifier.current!.notifySigningRequired("k1", SIGNING_COPY);
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it("does not notify or request permission when the feature flag is off", () => {
    flag.enabled = false;
    const notifier = renderNotifier();

    notifier.current!.requestPermission();
    notifier.current!.notifySigningRequired("k1", SIGNING_COPY);

    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("requests permission only while it is still undecided", () => {
    FakeNotification.permission = "default";

    renderNotifier().current!.requestPermission();
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);

    FakeNotification.permission = "granted";
    FakeNotification.requestPermission.mockClear();
    renderNotifier().current!.requestPermission();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });
});
