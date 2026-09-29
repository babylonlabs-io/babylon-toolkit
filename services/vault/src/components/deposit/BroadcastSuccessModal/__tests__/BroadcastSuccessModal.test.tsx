import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BroadcastSuccessModal } from "../index";

describe("BroadcastSuccessModal", () => {
  it("identifies the broadcast as Pre-Pegin", () => {
    render(<BroadcastSuccessModal open onClose={vi.fn()} amount="0.01" />);

    expect(
      screen.getByRole("heading", { name: "Pre-Pegin Broadcast" }),
    ).toBeInTheDocument();
  });

  it("shows the next steps in one sentence", () => {
    render(<BroadcastSuccessModal open onClose={vi.fn()} amount="0.01" />);

    expect(
      screen.getByText(
        "Once confirmed, you'll be asked to submit a WOTS key, sign payout authorizations, and activate your BTCVault.",
      ),
    ).toBeInTheDocument();
  });
});
