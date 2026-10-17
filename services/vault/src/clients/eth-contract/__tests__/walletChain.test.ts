import { createWalletClient, custom } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getETHChain } from "@/config/network";
import { COPY } from "@/copy";

import { getWalletClientOnExpectedChain } from "../walletChain";

const actions = vi.hoisted(() => {
  const connectorA = { uid: "connector-A", getChainId: vi.fn() };
  const connectorB = { uid: "connector-B", getChainId: vi.fn() };
  let connector: typeof connectorA | undefined = connectorA;
  return {
    connectorA,
    connectorB,
    getAccount: () => ({ connector, status: "connected" }),
    setConnector: (value: typeof connectorA | undefined) => {
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
  actions.connectorA.getChainId.mockResolvedValue(0);
  actions.switchChain.mockReset().mockResolvedValue(undefined);
  actions.getWalletClient.mockReset().mockResolvedValue(clientA);
});

describe("getWalletClientOnExpectedChain", () => {
  it("keeps the original connector through a retry and an A-to-B-to-A switch", async () => {
    let finishClient!: () => void;
    actions.connectorB.getChainId.mockResolvedValue(0);
    actions.getWalletClient
      .mockRejectedValueOnce(
        Object.assign(new Error("Connection lost"), {
          name: "ConnectorNotConnectedError",
        }),
      )
      .mockImplementationOnce(
        (_config, parameters: { connector?: { uid: string } }) => {
          const selected =
            parameters.connector ?? actions.getAccount().connector;
          return new Promise<typeof clientA>((resolve) => {
            finishClient = () =>
              resolve(selected === actions.connectorA ? clientA : clientB);
          });
        },
      );

    const pending = getWalletClientOnExpectedChain(account);
    actions.setConnector(actions.connectorB);
    await vi.waitFor(() =>
      expect(actions.getWalletClient).toHaveBeenCalledTimes(2),
    );
    actions.setConnector(actions.connectorA);
    finishClient();

    expect(await pending).toBe(clientA);
    expect(
      actions.getWalletClient.mock.calls.map(([, params]) => params.connector),
    ).toEqual([actions.connectorA, actions.connectorA]);
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
      COPY.wallet.connectToContinue,
    );
    expect(actions.switchChain).not.toHaveBeenCalled();
    expect(actions.getWalletClient).not.toHaveBeenCalled();
  });
});
