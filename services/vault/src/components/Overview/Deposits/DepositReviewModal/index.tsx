import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

import { useEstimatedBtcFee } from "../../../../hooks/deposit/useEstimatedBtcFee";
import { useEstimatedEthFee } from "../../../../hooks/deposit/useEstimatedEthFee";
import { useBTCPrice } from "../../../../hooks/useBTCPrice";
import { satoshiToBtcNumber } from "../../../../utils/btcConversion";
import { useVaultProviders } from "../hooks/useVaultProviders";

interface CollateralDepositReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: bigint;
  providers: string[];
}

export function CollateralDepositReviewModal({
  open,
  onClose,
  onConfirm,
  amount,
  providers,
}: CollateralDepositReviewModalProps) {
  // Convert satoshis to BTC for display
  const amountBtc = satoshiToBtcNumber(amount);

  // Fetch real-time BTC price from oracle
  const { btcPriceUSD, loading: btcPriceLoading } = useBTCPrice();

  // Calculate USD value using real-time price
  const amountUsd = btcPriceUSD > 0 ? amountBtc * btcPriceUSD : null;

  // Fetch real vault providers from API
  const { findProviders, loading: providersLoading } = useVaultProviders();

  // Get estimated fees from custom hooks
  const estimatedBtcFee = useEstimatedBtcFee(amount, open);
  const estimatedEthFee = useEstimatedEthFee();

  // Map selected provider IDs to actual provider data
  const selectedProviders = findProviders(providers);

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
              {btcPriceLoading
                ? "Loading price..."
                : amountUsd !== null
                  ? `($${amountUsd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} USD)`
                  : "(Price unavailable)"}
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
            {estimatedBtcFee !== null ? (
              <div className="flex flex-col items-end">
                <Text variant="body2">~{estimatedBtcFee.toFixed(8)} BTC</Text>
                {btcPriceUSD > 0 && (
                  <Text variant="body2" className="text-accent-secondary">
                    ($
                    {(estimatedBtcFee * btcPriceUSD).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    )
                  </Text>
                )}
              </div>
            ) : (
              <Text variant="body2" className="text-accent-secondary">
                Calculating BTC fee...
              </Text>
            )}

            {/* ETH Gas Fee */}
            {estimatedEthFee !== null ? (
              <Text variant="body2">~{estimatedEthFee.toFixed(6)} ETH</Text>
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
