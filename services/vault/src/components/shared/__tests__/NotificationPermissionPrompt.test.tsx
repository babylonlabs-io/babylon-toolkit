import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({
  value: null as null | {
    requestPermission: ReturnType<typeof vi.fn>;
    notifySigningRequired: ReturnType<typeof vi.fn>;
    shouldPromptForPermission: boolean;
    dismissPrompt: ReturnType<typeof vi.fn>;
    resetPromptDismissal: ReturnType<typeof vi.fn>;
    documentHidden: boolean;
    isActiveFlow: boolean;
    setActiveFlow: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/context/SigningNotificationContext", () => ({
  useSigningNotificationOptional: () => ctx.value,
}));

import { NotificationPermissionPrompt } from "../NotificationPermissionPrompt";

function makeContext(overrides: { shouldPromptForPermission?: boolean } = {}) {
  return {
    requestPermission: vi.fn(),
    notifySigningRequired: vi.fn(),
    shouldPromptForPermission: true,
    dismissPrompt: vi.fn(),
    resetPromptDismissal: vi.fn(),
    documentHidden: false,
    isActiveFlow: false,
    setActiveFlow: vi.fn(),
    ...overrides,
  };
}

describe("NotificationPermissionPrompt", () => {
  beforeEach(() => {
    ctx.value = null;
  });

  it("renders the enable prompt while the user should be prompted", () => {
    ctx.value = makeContext();
    const { getByText } = render(<NotificationPermissionPrompt />);
    expect(getByText("Stay notified")).toBeTruthy();
    expect(getByText("Enable notifications")).toBeTruthy();
    expect(getByText("No thanks")).toBeTruthy();
  });

  it("requests permission when Enable is clicked", () => {
    ctx.value = makeContext();
    const { getByText } = render(<NotificationPermissionPrompt />);

    fireEvent.click(getByText("Enable notifications"));

    expect(ctx.value.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("dismisses the prompt when No thanks is clicked", () => {
    ctx.value = makeContext();
    const { getByText } = render(<NotificationPermissionPrompt />);

    fireEvent.click(getByText("No thanks"));

    expect(ctx.value.dismissPrompt).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when the user should not be prompted", () => {
    ctx.value = makeContext({ shouldPromptForPermission: false });
    const { container } = render(<NotificationPermissionPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no provider is mounted", () => {
    ctx.value = null;
    const { container } = render(<NotificationPermissionPrompt />);
    expect(container).toBeEmptyDOMElement();
  });
});
