import { Button, FormControl, Input, ScrollLocker, Text } from "@babylonlabs-io/core-ui";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import type { Meta, StoryObj } from "@storybook/react";
import { initEccLib, Psbt } from "bitcoinjs-lib";
import { useState } from "react";

initEccLib(ecc);

import { IBTCProvider } from "@/core/types";
import { useWidgetState } from "@/hooks/useWidgetState";

import { config } from "./constants";
import { WalletProvider } from "./index";

const meta: Meta<typeof WalletProvider> = {
  component: WalletProvider,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <ScrollLocker>
        <WalletProvider persistent context={window.parent} config={config} onError={console.log}>
          <Story />
        </WalletProvider>
      </ScrollLocker>
    ),
  ],
  render: () => {
    const { open } = useWidgetState();

    return <Button onClick={open}>Connect Wallet</Button>;
  },
};

export const WithDisabledWallets: Story = {
  decorators: [
    (Story) => (
      <ScrollLocker>
        <WalletProvider
          persistent
          context={window.parent}
          config={config}
          onError={console.log}
          disabledWallets={["ledget_btc"]}
        >
          <Story />
        </WalletProvider>
      </ScrollLocker>
    ),
  ],
  render: () => {
    const { open } = useWidgetState();

    return <Button onClick={open}>Connect Wallet</Button>;
  },
};

export const WithConnectedData: Story = {
  decorators: [
    (Story) => (
      <ScrollLocker>
        <WalletProvider context={window.parent} config={config} onError={console.log}>
          <Story />
        </WalletProvider>
      </ScrollLocker>
    ),
  ],
  render: () => {
    const { open, selectedWallets } = useWidgetState();

    return (
      <div>
        <Button onClick={open}>Connect Wallet</Button>
        <div className="flex flex-col gap-4">
          {Object.entries(selectedWallets).map(
            ([chainName, wallet]) =>
              wallet?.account && (
                <div
                  className="rounded border border-secondary-main/30 p-4"
                  key={chainName}
                  data-testid={`${chainName.toLowerCase()}-wallet-section`}
                >
                  <Text variant="subtitle1" className="mb-2">
                    {chainName} Wallet
                  </Text>
                  <Text variant="body2" data-testid={`${chainName.toLowerCase()}-wallet-address`}>
                    Address: {wallet.account.address}
                  </Text>
                  <Text variant="body2" data-testid={`${chainName.toLowerCase()}-wallet-pubkey`}>
                    Public Key: {wallet.account.publicKeyHex}
                  </Text>
                </div>
              ),
          )}
        </div>
      </div>
    );
  },
};

export const WithBTCSigningFeatures: Story = {
  decorators: [
    (Story) => (
      <ScrollLocker>
        <WalletProvider context={window.parent} config={config} onError={console.log}>
          <Story />
        </WalletProvider>
      </ScrollLocker>
    ),
  ],
  render: () => {
    const { open, selectedWallets } = useWidgetState();
    const [messageToSignECDSA, setMessageToSignECDSA] = useState("");
    const [messageToSignBIP322, setMessageToSignBIP322] = useState("");
    const [psbtToSign, setPsbtToSign] = useState("");
    const [signedMessageECDSA, setSignedMessageECDSA] = useState("");
    const [signedMessageBIP322, setSignedMessageBIP322] = useState("");
    const [signedPsbt, setSignedPsbt] = useState("");
    const [transaction, setTransaction] = useState("");

    const btcProvider = selectedWallets.BTC?.provider as IBTCProvider | undefined;

    const handleSignMessageECDSA = async () => {
      if (!btcProvider || !messageToSignECDSA) return;

      try {
        const signature = await btcProvider.signMessage(messageToSignECDSA, "ecdsa");
        console.log("handleSignMessage ECDSA:", signature);
        setSignedMessageECDSA(signature);
      } catch (error) {
        console.error("Failed to sign message:", error);
      }
    };

    const handleSignMessageBIP322 = async () => {
      if (!btcProvider || !messageToSignBIP322) return;

      try {
        const signature = await btcProvider.signMessage(messageToSignBIP322, "bip322-simple");
        console.log("handleSignMessage BIP322:", signature);
        setSignedMessageBIP322(signature);
      } catch (error) {
        console.error("Failed to sign message:", error);
      }
    };

    const handleSignPsbt = async () => {
      if (!btcProvider || !psbtToSign) return;
      try {
        const signedPsbt = await btcProvider.signPsbt(psbtToSign);
        console.log("handleSignPsbt:", signedPsbt);
        setSignedPsbt(signedPsbt);
      } catch (error) {
        console.error("Failed to sign PSBT:", error);
      }
    };

    return (
      <div>
        <Button className="mb-4" onClick={open}>
          Connect Wallet
        </Button>

        <div className="flex flex-col gap-4">
          {btcProvider && (
            <div className="flex flex-col gap-4">
              <div className="rounded border border-secondary-main/30 p-4">
                <FormControl label="Sign Message - ECDSA" className="mb-2 py-2">
                  <Input
                    type="text"
                    value={messageToSignECDSA}
                    onChange={(e) => setMessageToSignECDSA(e.target.value)}
                    placeholder="Enter message to sign"
                  />
                </FormControl>

                <Button onClick={handleSignMessageECDSA}>Sign Message ECDSA</Button>

                {signedMessageECDSA && (
                  <div className="mt-2 flex items-center gap-2">
                    <Text variant="body2" className="flex-1 truncate">
                      Signed Message: {signedMessageECDSA}
                    </Text>
                    <Button onClick={() => setSignedMessageECDSA("")}>Delete</Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded border border-secondary-main/30 p-4">
                  <FormControl label="Sign Message - BIP322" className="mb-2 py-2">
                    <Input
                      type="text"
                      value={messageToSignBIP322}
                      onChange={(e) => setMessageToSignBIP322(e.target.value)}
                      placeholder="Enter message to sign"
                    />
                  </FormControl>

                  <Button onClick={handleSignMessageBIP322}>Sign Message BIP322</Button>

                  {signedMessageBIP322 && (
                    <div className="mt-2 flex items-center gap-2">
                      <Text variant="body2" className="flex-1 truncate">
                        Signed Message: {signedMessageBIP322}
                      </Text>
                      <Button onClick={() => setSignedMessageBIP322("")}>Delete</Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded border border-secondary-main/30 p-4">
                <FormControl label="Sign PSBT" className="mb-2 py-2">
                  <Input
                    type="text"
                    value={psbtToSign}
                    onChange={(e) => setPsbtToSign(e.target.value)}
                    placeholder="Enter PSBT hex"
                  />
                </FormControl>

                <Button onClick={handleSignPsbt}>Sign PSBT</Button>

                {signedPsbt && (
                  <div className="mt-2 flex items-center gap-2">
                    <Text variant="body2" className="flex-1 truncate">
                      Signed PSBT: {signedPsbt}
                    </Text>
                    <Button
                      onClick={() => {
                        setTransaction("");
                        setSignedPsbt("");
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}

                {signedPsbt && (
                  <div className="mt-2 flex items-center gap-2">
                    <Text variant="body2" className="flex-1 truncate">
                      Transaction: {transaction}
                    </Text>
                    <Button
                      onClick={() => {
                        if (!signedPsbt) return;

                        try {
                          const tx = Psbt.fromHex(signedPsbt).extractTransaction().toHex();
                          console.log("Extracted transaction:", tx);
                          setTransaction(tx);
                        } catch (error) {
                          console.error("Failed to extract transaction:", error);
                        }
                      }}
                    >
                      Extract transaction
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
};
