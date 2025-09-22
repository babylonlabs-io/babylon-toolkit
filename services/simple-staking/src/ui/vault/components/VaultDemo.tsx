import { useState } from "react";
import { Button, Card, Input, Text } from "@babylonlabs-io/core-ui";
import type { ETHTypedData } from "@babylonlabs-io/wallet-connector";

import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useETHWallet } from "@/ui/common/context/wallet/ETHWalletProvider";

/**
 * VaultDemo - Demonstrates wallet signing capabilities
 *
 * Provides examples of message signing for both BTC and ETH wallets
 */
export const VaultDemo = () => {
  const { signMessage: signBTCMessage } = useBTCWallet();
  const {
    signMessage: signETHMessage,
    signTypedData,
    chainId,
  } = useETHWallet();

  const [message, setMessage] = useState("Hello from Babylon Vault!");
  const [btcSignature, setBtcSignature] = useState<string>();
  const [ethSignature, setEthSignature] = useState<string>();
  const [typedDataSignature, setTypedDataSignature] = useState<string>();
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = (key: string) => {
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const setLoading = (key: string, loading: boolean) => {
    setIsLoading((prev) => ({ ...prev, [key]: loading }));
  };

  const setError = (key: string, error: string) => {
    setErrors((prev) => ({ ...prev, [key]: error }));
  };

  const handleBTCSign = async () => {
    try {
      clearError("btc");
      setLoading("btc", true);
      const signature = await signBTCMessage(message, "bip322-simple");
      setBtcSignature(signature);
    } catch (error) {
      console.error("BTC signing failed:", error);
      setError(
        "btc",
        error instanceof Error ? error.message : "Signing failed",
      );
    } finally {
      setLoading("btc", false);
    }
  };

  const handleETHSign = async () => {
    try {
      clearError("eth");
      setLoading("eth", true);
      const signature = await signETHMessage(message);
      setEthSignature(signature);
    } catch (error) {
      console.error("ETH signing failed:", error);
      setError(
        "eth",
        error instanceof Error ? error.message : "Signing failed",
      );
    } finally {
      setLoading("eth", false);
    }
  };

  const handleTypedDataSign = async () => {
    try {
      clearError("typedData");
      setLoading("typedData", true);

      // Use the current connected chain ID, fallback to environment config
      const currentChainId =
        chainId || parseInt(process.env.NEXT_PUBLIC_ETH_CHAIN_ID || "11155111");

      const typedData: ETHTypedData = {
        domain: {
          name: "Babylon Vault",
          version: "1",
          chainId: currentChainId,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        types: {
          Message: [
            { name: "from", type: "string" },
            { name: "content", type: "string" },
            { name: "timestamp", type: "uint256" },
          ],
        },
        primaryType: "Message",
        message: {
          from: "Babylon Vault",
          content: message,
          timestamp: Math.floor(Date.now() / 1000),
        },
      };

      const signature = await signTypedData(typedData);
      setTypedDataSignature(signature);
    } catch (error) {
      console.error("Typed data signing failed:", error);
      setError(
        "typedData",
        error instanceof Error ? error.message : "Signing failed",
      );
    } finally {
      setLoading("typedData", false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-4 text-2xl font-bold">Wallet Signing Demo</h2>
        <p className="mb-6 text-gray-600">
          Test message signing capabilities with both BTC and ETH wallets
        </p>

        {/* Message Input */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Message to Sign
          </label>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter message to sign..."
            className="w-full text-sm"
          />
        </div>

        {/* Signing Actions */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* BTC Message Signing */}
          <div className="space-y-2">
            <Button
              onClick={handleBTCSign}
              disabled={!message || isLoading.btc}
              className="w-full text-sm"
              variant="outlined"
            >
              {isLoading.btc ? "Signing..." : "Sign with BTC (BIP322)"}
            </Button>
            {errors.btc && (
              <Text variant="body2" className="text-sm text-red-600">
                {errors.btc}
              </Text>
            )}
          </div>

          {/* ETH Message Signing */}
          <div className="space-y-2">
            <Button
              onClick={handleETHSign}
              disabled={!message || isLoading.eth}
              className="w-full text-sm"
              variant="outlined"
            >
              {isLoading.eth ? "Signing..." : "Sign with ETH (personal_sign)"}
            </Button>
            {errors.eth && (
              <Text variant="body2" className="text-sm text-red-600">
                {errors.eth}
              </Text>
            )}
          </div>

          {/* ETH Typed Data Signing */}
          <div className="space-y-2">
            <Button
              onClick={handleTypedDataSign}
              disabled={!message || isLoading.typedData}
              className="w-full text-sm"
              variant="outlined"
            >
              {isLoading.typedData
                ? "Signing..."
                : "Sign ETH Typed Data (EIP-712)"}
            </Button>
            {errors.typedData && (
              <Text variant="body2" className="text-sm text-red-600">
                {errors.typedData}
              </Text>
            )}
          </div>
        </div>

        {/* Signature Results */}
        {(btcSignature || ethSignature || typedDataSignature) && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Signature Results</h3>

            {btcSignature && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <Text
                  variant="body2"
                  className="mb-2 font-medium text-orange-800"
                >
                  BTC Signature (BIP322-Simple)
                </Text>
                <Text
                  variant="body2"
                  className="break-all font-mono text-xs text-orange-700"
                >
                  {btcSignature}
                </Text>
              </div>
            )}

            {ethSignature && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <Text
                  variant="body2"
                  className="mb-2 font-medium text-blue-800"
                >
                  ETH Signature (personal_sign)
                </Text>
                <Text
                  variant="body2"
                  className="break-all font-mono text-xs text-blue-700"
                >
                  {ethSignature}
                </Text>
              </div>
            )}

            {typedDataSignature && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <Text
                  variant="body2"
                  className="mb-2 font-medium text-purple-800"
                >
                  ETH Typed Data Signature (EIP-712)
                </Text>
                <Text
                  variant="body2"
                  className="break-all font-mono text-xs text-purple-700"
                >
                  {typedDataSignature}
                </Text>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
