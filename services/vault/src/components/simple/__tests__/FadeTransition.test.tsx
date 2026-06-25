import { render, screen } from "@testing-library/react";
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
});
