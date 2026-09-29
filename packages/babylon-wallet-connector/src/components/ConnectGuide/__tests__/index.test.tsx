import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ConnectGuide } from "../index";

const STEPS = ["Plug in your device.", "Open the vault app."];
const INSTALL_STEPS = ["Install the vault app."];

it("lists the steps in order", () => {
  render(<ConnectGuide name="Device" logo="/device.svg" guide={{ steps: STEPS }} />);

  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(STEPS);
});

it('shows the install steps with a "Don\'t have the app yet?" prompt', () => {
  render(<ConnectGuide name="Device" logo="/device.svg" guide={{ steps: STEPS, installSteps: INSTALL_STEPS }} />);

  expect(screen.getByText("Don't have the app yet?")).toBeTruthy();
  expect(screen.getByText("Install the vault app.")).toBeTruthy();
});

it("leaves out the install section when the guide has no install steps", () => {
  render(<ConnectGuide name="Device" logo="/device.svg" guide={{ steps: STEPS }} />);

  expect(screen.queryByText("Don't have the app yet?")).toBeNull();
});

it("calls onConnect when the user selects Connect", () => {
  const onConnect = vi.fn();
  render(<ConnectGuide name="Device" logo="/device.svg" guide={{ steps: STEPS }} onConnect={onConnect} />);

  fireEvent.click(screen.getByTestId("connect-guide-connect-button"));

  expect(onConnect).toHaveBeenCalledOnce();
});
