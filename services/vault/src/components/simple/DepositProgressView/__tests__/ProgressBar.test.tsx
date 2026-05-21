import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("defaults to the success (green) fill when no color is given", () => {
    const { container } = render(<ProgressBar percent={0.5} />);
    expect(container.querySelector(".bg-success-light")).toBeInTheDocument();
  });

  it("tints the fill with an explicit color and drops the default class", () => {
    const { container } = render(<ProgressBar percent={0.5} color="#F7931A" />);
    const fill = container.querySelector<HTMLElement>("[style]");
    expect(fill).not.toBeNull();
    expect(fill).toHaveStyle({ backgroundColor: "#F7931A" });
    expect(
      container.querySelector(".bg-success-light"),
    ).not.toBeInTheDocument();
  });

  it("clamps the reported percentage to the 0-100 range", () => {
    render(<ProgressBar percent={1.5} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});
