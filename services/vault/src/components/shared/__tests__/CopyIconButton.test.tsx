import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CopyIconButton } from "../CopyIconButton";

// The enlarged touch target only exists on touch-first devices.
vi.mock("@babylonlabs-io/core-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/core-ui")>()),
  useIsTouchFirst: () => true,
}));

describe("CopyIconButton", () => {
  it("extends the touch target on every side by default", () => {
    render(<CopyIconButton value="0xabc" label="Copy" />);

    expect(screen.getByRole("button", { name: "Copy" }).className).toContain(
      "before:-inset-[13px]",
    );
  });

  it("keeps the touch target off its sides below md when asked, for a narrow column", () => {
    render(
      <CopyIconButton
        value="0xabc"
        label="Copy"
        touchTarget="verticalBelowMd"
      />,
    );

    const { className } = screen.getByRole("button", { name: "Copy" });
    expect(className).toContain("before:inset-x-0");
    expect(className).toContain("md:before:-inset-x-[13px]");
    expect(className).not.toContain("before:-inset-[13px]");
  });
});
