import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepRow } from "../StepRow";

describe("StepRow — sub-counter layout", () => {
  const props = {
    state: "active" as const,
    number: 1,
    label: "Sign payout transactions",
    description: "(0 of 5)",
  };

  it("stacks the counter below the label when compact (narrow split column)", () => {
    render(<StepRow {...props} compact />);
    const wrapper = screen.getByText(props.label).parentElement;
    expect(wrapper?.className).toContain("flex-col");
    // Counter still renders, just on its own line.
    expect(screen.getByText(props.description)).toBeInTheDocument();
  });

  it("keeps the counter inline with the label by default (single-column)", () => {
    render(<StepRow {...props} />);
    const wrapper = screen.getByText(props.label).parentElement;
    expect(wrapper?.className).toContain("items-baseline");
    expect(wrapper?.className).not.toContain("flex-col");
  });
});

describe("StepRow — failed step", () => {
  it("renders the label in the error colour when the step failed", () => {
    render(<StepRow state="error" number={1} label="Submit WOTS key" />);

    const label = screen.getByText("Submit WOTS key");
    expect(label.className).toContain("text-error-main");
    expect(label.className).not.toContain("text-accent-secondary");
  });

  it("keeps the label muted while the step is still pending", () => {
    render(<StepRow state="pending" number={1} label="Submit WOTS key" />);

    expect(screen.getByText("Submit WOTS key").className).toContain(
      "text-accent-secondary",
    );
  });
});
