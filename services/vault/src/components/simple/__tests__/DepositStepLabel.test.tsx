import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DepositStepLabel } from "../DepositStepLabel";

describe("DepositStepLabel", () => {
  it("renders the step counter and the step label", () => {
    render(
      <DepositStepLabel
        visualStep={6}
        totalSteps={11}
        label="Awaiting Bitcoin confirmation"
      />,
    );
    expect(screen.getByText("Step 6 of 11")).toBeInTheDocument();
    expect(
      screen.getByText("Awaiting Bitcoin confirmation"),
    ).toBeInTheDocument();
  });
});
