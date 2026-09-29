import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { FullScreenDialog } from "../FullScreenDialog";

function renderWithBack() {
  render(
    <FullScreenDialog open onBack={() => {}}>
      content
    </FullScreenDialog>,
  );

  return screen.getByLabelText("Back");
}

it("gives the back control a 40x40 hit area", () => {
  expect(renderWithBack()).toHaveClass("size-10");
});

it("turns the back chevron orange on hover", () => {
  const button = renderWithBack();

  expect(button).toHaveClass("text-accent-primary", "transition-colors", "hover:text-secondary-main");
  expect(button.querySelector("svg")).toHaveClass("text-inherit");
});
