import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { ConnectedWallet } from "../index";

it("fills the connected-address row with the neutral-200 surface", () => {
  const { container } = render(<ConnectedWallet logo="" address="bc1qexampleaddress" />);

  expect(container.firstElementChild?.classList.contains("bg-neutral-200")).toBe(true);
});
