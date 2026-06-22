import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({
  value: null as null | {
    requestPermission: ReturnType<typeof vi.fn>;
    notifySigningRequired: ReturnType<typeof vi.fn>;
    shouldPromptForPermission: boolean;
  },
}));

vi.mock("@/context/SigningNotificationContext", () => ({
  useSigningNotificationOptional: () => ctx.value,
}));

import { NotificationPermissionBanner } from "../NotificationPermissionBanner";

function makeContext(shouldPromptForPermission: boolean) {
  return {
    requestPermission: vi.fn(),
    notifySigningRequired: vi.fn(),
    shouldPromptForPermission,
  };
}

describe("NotificationPermissionBanner", () => {
  beforeEach(() => {
    ctx.value = null;
  });

  it("renders nothing when no provider is mounted", () => {
    ctx.value = null;
    const { container } = render(<NotificationPermissionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the user has already decided", () => {
    ctx.value = makeContext(false);
    const { container } = render(<NotificationPermissionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("requests permission when Enable is clicked", () => {
    ctx.value = makeContext(true);
    const { getByText } = render(<NotificationPermissionBanner />);

    fireEvent.click(getByText("Enable"));

    expect(ctx.value.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("hides itself for the session when dismissed", () => {
    ctx.value = makeContext(true);
    const { getByLabelText, container } = render(
      <NotificationPermissionBanner />,
    );

    fireEvent.click(getByLabelText("Dismiss notification prompt"));

    expect(container).toBeEmptyDOMElement();
  });
});
