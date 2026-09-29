import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { WalletIcon } from "../WalletIcon";

it("clips a brand-filled wallet mark to the 4px rounded square, not a circle", () => {
  render(<WalletIcon url="/okx.svg" alt="OKX" background="#000000" />);

  const shape = screen.getByAltText("OKX").parentElement;

  expect(shape).toHaveClass("bbn-avatar-rounded");
  expect(shape).not.toHaveClass("bbn-avatar-circular");
});
