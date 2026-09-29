import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { StepRow } from "../StepRow";

describe("StepRow — failed step", () => {
  it("announces the failure to screen readers, not by colour alone", () => {
    render(
      <StepRow
        state="error"
        number={1}
        ariaNumber={8}
        label="Submit WOTS key"
      />,
    );

    expect(
      screen.getByLabelText(COPY.deposit.a11y.stepFailed(8)),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(COPY.deposit.a11y.stepActive(8)),
    ).not.toBeInTheDocument();
  });

  it("keeps the label muted while the step is still pending", () => {
    render(<StepRow state="pending" number={1} label="Submit WOTS key" />);

    expect(screen.getByText("Submit WOTS key").className).toContain(
      "text-accent-secondary",
    );
  });
});
