import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useEstimateGas, useGasPrice } from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatEther } from "viem";

import { CONTRACTS } from "../../../../config/contracts";
import { satoshiToBtcNumber } from "../../../../utils/btcConversion";
import { estimatePeginFee } from "../../../../utils/fee/peginFee";
import { getNetworkFees } from "../../../../utils/mempoolApi";
import { useVaultProviders } from "../hooks/useVaultProviders";

interface CollateralDepositReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: bigint;
  providers: string[];
  btcPrice?: number;
  ethPrice?: number;
}

export function CollateralDepositReviewModal({
  open,
  onClose,
  onConfirm,
  amount,
  providers,
  btcPrice = 97833.68,
  ethPrice = 3200, // Default ETH price
}: CollateralDepositReviewModalProps) {
  // Convert satoshis to BTC for display
  const amountBtc = satoshiToBtcNumber(amount);

  // Calculate USD value
  const amountUsd = amountBtc * btcPrice;

  // Fetch real vault providers from API
  const { providers: apiProviders, loading: providersLoading } =
    useVaultProviders();

  // Fetch current BTC network fees
  const { data: networkFees, isLoading: feesLoading } = useQuery({
    queryKey: ["networkFees"],
    queryFn: getNetworkFees,
    enabled: open, // Only fetch when modal is open
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refresh every minute while modal is open
  });

  // Estimate ETH gas for the transaction
  const { data: gasEstimate } = useEstimateGas({
    to: CONTRACTS.MORPHO_CONTROLLER,
    // Rough estimate for submitPeginRequest function
    // Actual gas will be calculated at transaction time
    data: "0x" as `0x${string}`, // Placeholder for actual function call
  });

  // Get current gas price
  const { data: gasPrice } = useGasPrice();

  // Calculate estimated BTC fee
  const estimatedBtcFee = useMemo(() => {
    if (!networkFees) return null;

    // Use a rough UTXO estimate for fee calculation
    // Assume we need 1 UTXO that covers amount + fee
    const roughUtxo = { value: amount + 100000n }; // Add buffer for fee

    try {
      // Use halfHourFee for reasonable confirmation time
      const feeInSats = estimatePeginFee(
        amount,
        [roughUtxo],
        networkFees.halfHourFee,
      );

      return satoshiToBtcNumber(feeInSats);
    } catch (error) {
      console.error("Failed to estimate BTC fee:", error);
      return null;
    }
  }, [networkFees, amount]);

  // Calculate estimated ETH fee
  const estimatedEthFee = useMemo(() => {
    if (!gasEstimate || !gasPrice) return null;

    // Add 20% buffer to gas estimate for safety
    const gasWithBuffer = (gasEstimate * 120n) / 100n;
    const feeInWei = gasWithBuffer * gasPrice;

    return parseFloat(formatEther(feeInWei));
  }, [gasEstimate, gasPrice]);

  // Map selected provider IDs to actual provider data
  const selectedProviders = useMemo(() => {
    if (!apiProviders || apiProviders.length === 0) {
      // Fallback to provider IDs if API data not available
      return providers.map((id) => ({
        id,
        name: id,
        icon: null,
      }));
    }

    return providers.map((providerId) => {
      const provider = apiProviders.find((p) => p.id === providerId);
      return provider
        ? { ...provider, name: provider.id }
        : { id: providerId, name: providerId, icon: null };
    });
  }, [providers, apiProviders]);

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Review"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          Review the details before confirming your deposit
        </Text>

        {/* Deposit Amount - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Deposit Amount
          </Text>
          <div className="flex flex-col items-end">
            <Text variant="body1" className="font-medium">
              {amountBtc} BTC
            </Text>
            <Text variant="body2" className="text-accent-secondary">
              ($
              {amountUsd.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              USD)
            </Text>
          </div>
        </div>

        {/* Vault Providers - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Vault Provider(s)
          </Text>
          <div className="flex flex-col items-end gap-3">
            {providersLoading ? (
              <Text variant="body2" className="text-accent-secondary">
                Loading providers...
              </Text>
            ) : (
              selectedProviders.map((provider) => (
                <div key={provider.id} className="flex items-center gap-3">
                  {/* Provider icon - using first letter as fallback */}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary">
                    <Text
                      variant="body2"
                      className="text-sm font-medium text-accent-contrast"
                    >
                      {provider.name.charAt(0).toUpperCase()}
                    </Text>
                  </div>
                  <Text variant="body1">{provider.name}</Text>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Fees - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Fees
          </Text>
          <div className="flex flex-col items-end gap-1">
            {/* BTC Fee */}
            {feesLoading ? (
              <Text variant="body2" className="text-accent-secondary">
                Calculating BTC fee...
              </Text>
            ) : estimatedBtcFee !== null ? (
              <div className="flex flex-col items-end">
                <Text variant="body2">~{estimatedBtcFee.toFixed(8)} BTC</Text>
                <Text variant="body2" className="text-accent-secondary">
                  (${(estimatedBtcFee * btcPrice).toFixed(2)})
                </Text>
              </div>
            ) : (
              <Text variant="body2" className="text-accent-secondary">
                BTC fee unavailable
              </Text>
            )}

            {/* ETH Gas Fee */}
            {estimatedEthFee !== null ? (
              <div className="flex flex-col items-end">
                <Text variant="body2">~{estimatedEthFee.toFixed(6)} ETH</Text>
                <Text variant="body2" className="text-accent-secondary">
                  (${(estimatedEthFee * ethPrice).toFixed(2)})
                </Text>
              </div>
            ) : (
              <Text variant="body2" className="text-accent-secondary">
                ETH gas estimate pending...
              </Text>
            )}

            <Text
              variant="body2"
              className="mt-1 text-xs text-accent-secondary"
            >
              * Final fees calculated at transaction time
            </Text>
          </div>
        </div>

        {/* Divider */}
        <div className="border-divider border-t" />

        {/* Attention Section - No Border */}
        <div className="flex flex-col gap-3">
          <Heading variant="h6" className="text-base font-semibold">
            Attention!
          </Heading>
          <Text variant="body2" className="text-sm text-accent-secondary">
            1. Your BTC remains secure and cannot be accessed by third parties.
            Only you can withdraw your funds. After submission, your deposit
            will be verified. This may take up to 5 hours, during which your
            deposit will appear as Pending until confirmed on the Bitcoin
            network.
          </Text>
        </div>
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button variant="contained" color="primary" onClick={onConfirm} fluid>
          Confirm
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
