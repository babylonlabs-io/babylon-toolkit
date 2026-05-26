import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { PeginTxHashRow } from "../PeginTxHashRow";

// 0x-prefixed, all-1s vs all-2s so the two hashes are distinguishable in
// explorer hrefs (mempool URLs strip the 0x prefix).
const PEGIN_TX_HASH = `0x${"1".repeat(64)}`;
const PRE_PEGIN_TX_HASH = `0x${"2".repeat(64)}`;
const PEGIN_TXID = "1".repeat(64);
const PRE_PEGIN_TXID = "2".repeat(64);

describe("PeginTxHashRow", () => {
  it("renders both Pegin and Pre-Pegin segments with the TX Hash label", () => {
    render(
      <PeginTxHashRow
        peginTxHash={PEGIN_TX_HASH}
        prePeginTxHash={PRE_PEGIN_TX_HASH}
      />,
    );

    expect(screen.getByText(COPY.pegin.txHash.label)).toBeInTheDocument();
    expect(screen.getByText(COPY.pegin.txHash.pegin)).toBeInTheDocument();
    expect(screen.getByText(COPY.pegin.txHash.prePegin)).toBeInTheDocument();
  });

  it("links only the Pre-Pegin hash by default (pegin tx not yet on Bitcoin)", () => {
    render(
      <PeginTxHashRow
        peginTxHash={PEGIN_TX_HASH}
        prePeginTxHash={PRE_PEGIN_TX_HASH}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      expect.stringContaining(PRE_PEGIN_TXID),
    );
    // Pegin hash is copy-only — no link points at its txid.
    expect(
      links.some((l) => l.getAttribute("href")?.includes(PEGIN_TXID)),
    ).toBe(false);
  });

  it("links the Pegin hash too when linkPegin is set", () => {
    render(
      <PeginTxHashRow
        peginTxHash={PEGIN_TX_HASH}
        prePeginTxHash={PRE_PEGIN_TX_HASH}
        linkPegin
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(
      links.some((l) => l.getAttribute("href")?.includes(PEGIN_TXID)),
    ).toBe(true);
    expect(
      links.some((l) => l.getAttribute("href")?.includes(PRE_PEGIN_TXID)),
    ).toBe(true);
  });

  it("renders a single segment without a divider when only one hash is present", () => {
    render(<PeginTxHashRow prePeginTxHash={PRE_PEGIN_TX_HASH} />);

    expect(screen.getByText(COPY.pegin.txHash.prePegin)).toBeInTheDocument();
    expect(screen.queryByText(COPY.pegin.txHash.pegin)).not.toBeInTheDocument();
  });

  it("renders nothing when neither hash is available", () => {
    const { container } = render(<PeginTxHashRow />);
    expect(container).toBeEmptyDOMElement();
  });
});
