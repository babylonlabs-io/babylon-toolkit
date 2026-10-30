import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { Dialog } from "../Dialog";
import { ResponsiveDialog } from "../ResponsiveDialog";

it("keeps child state when the viewport crosses the mobile breakpoint", async () => {
  const originalWidth = window.innerWidth;
  window.innerWidth = 1024;
  try {
    render(
      <ResponsiveDialog open data-testid="resize-dialog">
        <input type="checkbox" aria-label="Download" />
      </ResponsiveDialog>,
    );
    const input = screen.getByRole("checkbox");
    fireEvent.click(input);
    for (const width of [767, 768]) {
      window.innerWidth = width;
      fireEvent.resize(window);
      await waitFor(() =>
        expect(screen.getByTestId("resize-dialog")).toHaveClass(
          width < 768 ? "bbn-dialog-mobile" : "bbn-dialog-wrapper",
        ),
      );
      expect(screen.getByRole("checkbox")).toBe(input);
      expect(input).toBeChecked();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    }
  } finally {
    window.innerWidth = originalWidth;
  }
});

it.each([false, true])("calls the animation handler and closes with mobile=%s", (mobile) => {
  const onAnimationEnd = vi.fn();
  const { rerender } = render(<Dialog open mobile={mobile} onAnimationEnd={onAnimationEnd} />);
  fireEvent.animationEnd(screen.getByTestId(mobile ? "dialog-wrapper" : "dialog"));
  expect(onAnimationEnd).toHaveBeenCalledOnce();
  rerender(<Dialog open={false} mobile={mobile} onAnimationEnd={onAnimationEnd} />);
  fireEvent.animationEnd(screen.getByTestId(mobile ? "dialog-wrapper" : "dialog"));
  expect(onAnimationEnd).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  rerender(<Dialog open mobile={mobile} onAnimationEnd={onAnimationEnd} />);
  expect(screen.getByTestId(mobile ? "dialog-wrapper" : "dialog")).toHaveClass(
    mobile ? "animate-mobile-modal-in" : "animate-modal-in",
  );
});

it.each([false, true])("does not restart interrupted entry after resize from mobile=%s", (mobile) => {
  const { rerender } = render(<Dialog open mobile={mobile} />);
  const input = screen.getByTestId("dialog");
  for (const nextMobile of [!mobile, mobile]) {
    rerender(<Dialog open mobile={nextMobile} />);
    expect(screen.getByTestId("dialog")).toBe(input);
    expect(document.querySelector(".animate-modal-in, .animate-mobile-modal-in")).toBeNull();
  }
});

it.each([false, true])("applies the surface styles with mobile=%s", (mobile) => {
  render(<Dialog open mobile={mobile} dialogClassName="!rounded-2xl !bg-background-contrast" />);
  expect(screen.getByTestId(mobile ? "dialog-wrapper" : "dialog")).toHaveClass(
    "!rounded-2xl",
    "!bg-background-contrast",
  );
});

it.each([false, true])("respects the backdrop option with mobile=%s", (mobile) => {
  const { rerender } = render(<Dialog open mobile={mobile} hasBackdrop={false} />);
  expect(document.querySelector(".bbn-backdrop")).toBeNull();
  rerender(<Dialog open mobile={mobile} />);
  expect(document.querySelectorAll(".bbn-backdrop")).toHaveLength(1);
});
