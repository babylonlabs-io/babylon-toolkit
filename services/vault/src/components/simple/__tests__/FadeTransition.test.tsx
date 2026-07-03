import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FadeTransition } from "../FadeTransition";

function setReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("FadeTransition", () => {
  it("renders content immediately at full opacity when reduced motion is preferred", () => {
    setReducedMotion(true);
    const { rerender } = render(<FadeTransition stepKey="a">A</FadeTransition>);
    rerender(<FadeTransition stepKey="b">B</FadeTransition>);
    const el = screen.getByText("B");
    expect(el.style.opacity).toBe("1");
  });

  it("settles at translateY(0) with no rise when reduced motion is preferred", () => {
    setReducedMotion(true);
    const { rerender } = render(<FadeTransition stepKey="a">A</FadeTransition>);
    rerender(<FadeTransition stepKey="b">B</FadeTransition>);
    const el = screen.getByText("B");
    expect(el.style.transform).toBe("translateY(0)");
  });

  it("shows content final on the initial mount under reduced motion (no first-paint fade)", () => {
    setReducedMotion(true);
    render(<FadeTransition stepKey="a">A</FadeTransition>);
    const el = screen.getByText("A");
    expect(el.style.opacity).toBe("1");
    expect(el.style.transform).toBe("translateY(0)");
  });

  it("renders content visible on the initial mount with motion enabled", () => {
    setReducedMotion(false);
    render(<FadeTransition stepKey="a">A</FadeTransition>);
    expect(screen.getByText("A").style.opacity).toBe("1");
  });

  it("hides the new content on a step change, then fades it in", async () => {
    setReducedMotion(false);
    const { rerender } = render(<FadeTransition stepKey="a">A</FadeTransition>);
    rerender(<FadeTransition stepKey="b">B</FadeTransition>);
    const el = screen.getByText("B");
    // The step change resets to hidden so the entrance fade can play.
    expect(el.style.opacity).toBe("0");
    // The double-rAF in the effect then settles it back to fully visible.
    await waitFor(() => expect(el.style.opacity).toBe("1"));
  });
});
