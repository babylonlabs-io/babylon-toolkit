import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Callout } from "../Callout";

describe("Callout", () => {
  it("paints the accent variant's icon tile with the brand orange background", () => {
    const { container } = render(<Callout variant="accent">Locked</Callout>);

    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(
      "bg-secondary-main",
    );
  });

  it("announces an accent callout as a status unless the caller asks for an alert", () => {
    const { rerender } = render(<Callout variant="accent">Locked</Callout>);

    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(
      <Callout variant="accent" role="alert">
        Locked
      </Callout>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
