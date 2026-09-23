import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { ChainButton } from "../index";

it("fills the selector row with the neutral-200 surface", () => {
  render(<ChainButton title="Select Bitcoin Wallet" />);

  expect(screen.getByRole("button").classList.contains("bg-neutral-200")).toBe(true);
});

it("shows the description with the title", () => {
  render(
    <ChainButton title="Select Bitcoin Wallet" description="Used to deposit and manage your Bitcoin collateral." />,
  );

  expect(screen.getByText("Select Bitcoin Wallet")).toBeTruthy();
  expect(screen.getByText("Used to deposit and manage your Bitcoin collateral.")).toBeTruthy();
});
