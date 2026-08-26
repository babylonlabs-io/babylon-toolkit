import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WalletMenu } from "../WalletMenu";

const SELECTED_WALLETS = {
  BTC: { name: "UniSat", icon: "" },
  ETH: { name: "MetaMask", icon: "" },
};

function renderMenu(props: Partial<React.ComponentProps<typeof WalletMenu>> = {}) {
  const onDisconnect = vi.fn();

  render(
    <WalletMenu
      trigger={<button>wallets</button>}
      selectedWallets={SELECTED_WALLETS}
      onDisconnect={onDisconnect}
      forceOpen
      {...props}
    />,
  );

  return { onDisconnect };
}

describe("Ethereum-only state", () => {
  it("renders no Bitcoin card when no Bitcoin address is supplied", () => {
    renderMenu({ ethAddress: "0xdepositor" });

    expect(screen.getByText("Ethereum Wallet")).toBeInTheDocument();
    expect(screen.queryByText("Bitcoin Wallet")).not.toBeInTheDocument();
  });

  it("renders no settings section when the host supplies none", () => {
    renderMenu({ ethAddress: "0xdepositor", settingsSection: null });

    expect(screen.queryByText("Using Inscriptions")).not.toBeInTheDocument();
    expect(screen.queryByText("Bitcoin Public Key")).not.toBeInTheDocument();
  });

  it("offers the connect action with the label the app supplied", () => {
    const onClick = vi.fn();
    renderMenu({ ethAddress: "0xdepositor", connectAction: { label: "Connect Bitcoin Wallet", onClick } });

    fireEvent.click(screen.getByText("Connect Bitcoin Wallet"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders no connect action when the host supplies none", () => {
    renderMenu({ ethAddress: "0xdepositor" });

    expect(screen.queryByText("Connect Bitcoin Wallet")).not.toBeInTheDocument();
  });
});

describe("disconnecting", () => {
  it("disconnects only the named chain from that wallet's own control", () => {
    const { onDisconnect } = renderMenu({
      btcAddress: "bc1pdepositor",
      ethAddress: "0xdepositor",
      perChainDisconnect: true,
    });

    fireEvent.click(screen.getByLabelText("Disconnect Bitcoin wallet"));

    expect(onDisconnect).toHaveBeenCalledExactlyOnceWith("BTC");
  });

  it("disconnects everything from the shared button, passing no chain", () => {
    const { onDisconnect } = renderMenu({
      btcAddress: "bc1pdepositor",
      ethAddress: "0xdepositor",
      perChainDisconnect: true,
    });

    fireEvent.click(screen.getByText("Disconnect Wallets"));

    expect(onDisconnect).toHaveBeenCalledExactlyOnceWith();
  });

  it("renders no per-wallet controls unless the host opts in", () => {
    renderMenu({ btcAddress: "bc1pdepositor", ethAddress: "0xdepositor" });

    expect(screen.queryByLabelText("Disconnect Bitcoin wallet")).not.toBeInTheDocument();
    expect(screen.getByText("Disconnect Wallets")).toBeInTheDocument();
  });
});
