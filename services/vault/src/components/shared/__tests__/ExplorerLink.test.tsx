import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExplorerLink } from "../ExplorerLink";

describe("ExplorerLink", () => {
  it("renders an external link to href with the label as its accessible name", () => {
    render(
      <ExplorerLink
        href="https://explorer.test/vault/0xabc"
        label="View vault on explorer"
      />,
    );

    const link = screen.getByRole("link", { name: "View vault on explorer" });
    expect(link).toHaveAttribute("href", "https://explorer.test/vault/0xabc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders nothing when href is undefined (no link when explorer is unconfigured)", () => {
    const { container } = render(
      <ExplorerLink label="View vault on explorer" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
