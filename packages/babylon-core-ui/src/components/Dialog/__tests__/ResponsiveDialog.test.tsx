import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";

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
    }
  } finally {
    window.innerWidth = originalWidth;
  }
});
