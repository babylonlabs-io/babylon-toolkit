import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { V3ModalShell } from "../V3ModalShell";

vi.mock("@babylonlabs-io/core-ui", () => ({
  // Escape stands in for the dialog's own dismissal, which calls `onClose`.
  FullScreenDialog: ({
    open,
    onClose,
    children,
  }: {
    open: boolean;
    onClose?: () => void;
    children: ReactNode;
  }) =>
    open ? (
      <div
        role="dialog"
        onKeyDown={(event) => event.key === "Escape" && onClose?.()}
      >
        {children}
      </div>
    ) : null,
  StandardSettingsMenu: () => null,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("@/components/shared/NetworkBadge", () => ({
  NetworkBadge: () => null,
}));

describe("V3ModalShell", () => {
  it("shows close when no back handler is given", () => {
    const onClose = vi.fn();
    render(
      <V3ModalShell open onClose={onClose}>
        body
      </V3ModalShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: COPY.common.close }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: COPY.common.back }),
    ).not.toBeInTheDocument();
  });

  it("shows back in place of close when a back handler is given", () => {
    const onBack = vi.fn();
    render(
      <V3ModalShell open onClose={vi.fn()} onBack={onBack}>
        body
      </V3ModalShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: COPY.common.back }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: COPY.common.close }),
    ).not.toBeInTheDocument();
  });

  it("keeps Escape dismissing the dialog while back is shown", () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    render(
      <V3ModalShell open onClose={onClose} onBack={onBack}>
        body
      </V3ModalShell>,
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
  });
});
