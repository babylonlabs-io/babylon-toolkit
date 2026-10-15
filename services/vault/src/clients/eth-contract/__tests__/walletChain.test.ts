import { createWalletClient, custom } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getETHChain } from "@/config/network";
import { COPY } from "@/copy";

import { getWalletClientOnExpectedChain } from "../walletChain";

const actions = vi.hoisted(() => {
  const connectorA = { uid: "connector-A" };
  const connectorB = { uid: "connector-B" };
  let connector: { uid: string } | undefined = connectorA;
  return {
    connectorA,
    connectorB,
    getAccount: () => ({ connector }),
    setConnector: (value: { uid: string } | undefined) => {
      connector = value;
    },
    switchChain: vi.fn(),
    getWalletClient: vi.fn(),
  };
});

vi.mock("wagmi/actions", () => ({
  getAccount: actions.getAccount,
  switchChain: actions.switchChain,
  getWalletClient: actions.getWalletClient,
}));
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: () => ({}),
}));

const account = "0x000000000000000000000000000000000000dEaD";
const clientA = createWalletClient({
  account,
  chain: getETHChain(),
  transport: custom({ request: vi.fn() }),
});
const clientB = createWalletClient({
  account,
  chain: getETHChain(),
  transport: custom({ request: vi.fn() }),
});

beforeEach(() => {
  actions.setConnector(actions.connectorA);
  actions.switchChain.mockReset().mockResolvedValue(undefined);
  actions.getWalletClient.mockReset().mockResolvedValue(clientA);
});

describe("getWalletClientOnExpectedChain", () => {
  it("keeps the original connector through an A-to-B-to-A switch", async () => {
    let finishSwitch!: () => void;
    let finishClient!: () => void;
    actions.switchChain.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSwitch = resolve;
        }),
    );
    actions.getWalletClient.mockImplementationOnce(
      (_config, parameters: { connector?: { uid: string } }) => {
        const selected = parameters.connector ?? actions.getAccount().connector;
        return new Promise<typeof clientA>((resolve) => {
          finishClient = () =>
            resolve(selected === actions.connectorA ? clientA : clientB);
        });
      },
    );

    const pending = getWalletClientOnExpectedChain(account);
    actions.setConnector(actions.connectorB);
    finishSwitch();
    await vi.waitFor(() => expect(actions.getWalletClient).toHaveBeenCalled());
    actions.setConnector(actions.connectorA);
    finishClient();

    expect(await pending).toBe(clientA);
    expect(actions.switchChain).toHaveBeenCalledWith(
      {},
      {
        chainId: getETHChain().id,
        connector: actions.connectorA,
      },
    );
    expect(actions.getWalletClient).toHaveBeenCalledWith(
      {},
      {
        chainId: getETHChain().id,
        account,
        connector: actions.connectorA,
      },
    );
  });

  it("keeps the current chain-switch error when the original wallet refuses", async () => {
    actions.switchChain.mockRejectedValue(
      new Error("Wallet refused the switch"),
    );
    await expect(getWalletClientOnExpectedChain(account)).rejects.toThrow(
      COPY.wallet.chainSwitch.required(COPY.wallet.chainSwitch.sepoliaTestnet),
    );
    expect(actions.getWalletClient).not.toHaveBeenCalled();
  });

  it("refuses to select a wallet without an existing connector", async () => {
    actions.setConnector(undefined);
    await expect(getWalletClientOnExpectedChain(account)).rejects.toThrow(
      "Failed to get wallet client",
    );
    expect(actions.switchChain).not.toHaveBeenCalled();
    expect(actions.getWalletClient).not.toHaveBeenCalled();
  });
});
