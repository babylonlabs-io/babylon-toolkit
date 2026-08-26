import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoticeBanner } from "../NoticeBanner";

describe("NoticeBanner", () => {
  it("renders the freeform message when visible", () => {
    render(
      <NoticeBanner visible message="Peg-ins are intermittently delayed." />,
    );

    expect(
      screen.getByText("Peg-ins are intermittently delayed."),
    ).toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(
      <NoticeBanner visible={false} message="Peg-ins are delayed." />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the message is empty even if visible", () => {
    const { container } = render(<NoticeBanner visible message="" />);

    expect(container).toBeEmptyDOMElement();
  });
});
