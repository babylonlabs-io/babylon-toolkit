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
  rerender(<Dialog open={false} mobile={mobile} onAnimationEnd={onAnimationEnd} />);
  fireEvent.animationEnd(screen.getByTestId(mobile ? "dialog-wrapper" : "dialog"));
  expect(onAnimationEnd).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each([false, true])("respects the backdrop option with mobile=%s", (mobile) => {
  const { rerender } = render(<Dialog open mobile={mobile} hasBackdrop={false} />);
  expect(document.querySelector(".bbn-backdrop")).toBeNull();
  rerender(<Dialog open mobile={mobile} />);
  expect(document.querySelectorAll(".bbn-backdrop")).toHaveLength(1);
});
