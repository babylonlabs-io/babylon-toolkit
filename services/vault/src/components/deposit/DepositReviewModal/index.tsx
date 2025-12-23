import {
  Button,
  CheckIcon,
  CopyIcon,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Heading,
  ResponsiveDialog,
  Text,
  useCopy,
} from "@babylonlabs-io/core-ui";

import { useEstimatedBtcFee } from "../../../hooks/deposit/useEstimatedBtcFee";
import { useEstimatedEthFee } from "../../../hooks/deposit/useEstimatedEthFee";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import { useBTCPrice } from "../../../hooks/useBTCPrice";
import { truncateAddress } from "../../../utils/addressUtils";
import { satoshiToBtcNumber } from "../../../utils/btcConversion";

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

  const { isCopied, copyToClipboard } = useCopy();

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Review"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto text-accent-primary">
        <Text variant="body2" className="text-accent-secondary">
          Review the details before confirming your deposit
        </Text>

        {/* Deposit Amount - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Deposit Amount
          </Text>
          <div className="flex items-center gap-2">
            <Text variant="body1" className="font-medium">
              {amountBtc} BTC
            </Text>
            <Text variant="body1" className="text-accent-secondary">
              {btcPriceLoading
                ? "Loading price..."
                : amountUsd !== null
                  ? `$${amountUsd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} USD`
                  : "Price unavailable"}
            </Text>
          </div>
        </div>

        {/* Vault Providers - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            {selectedProviders.length === 1
              ? "Vault Provider"
              : "Vault Providers"}
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
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary">
                    <Text
                      variant="body2"
                      className="text-sm font-medium text-accent-contrast"
                    >
                      {provider.name.charAt(0).toUpperCase()}
                    </Text>
                  </div>
                  <Text variant="body1">
                    {provider.name.startsWith("0x")
                      ? truncateAddress(provider.name)
                      : provider.name}
                  </Text>
                  {provider.name.startsWith("0x") && (
                    <button
                      onClick={() =>
                        copyToClipboard(provider.id, provider.name)
                      }
                      className="cursor-pointer"
                    >
                      {isCopied(provider.id) ? (
                        <CheckIcon size={14} color="text-green-600" />
                      ) : (
                        <CopyIcon size={14} />
                      )}
                    </button>
                  )}
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
              <div className="flex items-center gap-2">
                <Text variant="body1">~{estimatedBtcFee.toFixed(8)} BTC</Text>
                {btcPriceUSD > 0 && (
                  <Text variant="body1" className="text-accent-secondary">
                    $
                    {(estimatedBtcFee * btcPriceUSD).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                )}
              </div>
            ) : (
              <Text variant="body1" className="text-accent-secondary">
                Calculating BTC fee...
              </Text>
            )}

            {/* ETH Gas Fee */}
            {estimatedEthFee !== null ? (
              <Text variant="body1">~{estimatedEthFee.toFixed(6)} ETH</Text>
            ) : (
              <Text variant="body1" className="text-accent-secondary">
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
            Your BTC remains secure and cannot be accessed by third parties.
            Only you can withdraw your funds. After submission, your deposit
            will be verified. This may take up to 5 hours, during which your
            deposit will appear as Pending until confirmed on the Bitcoin
            network.
          </Text>
        </div>
      </DialogBody>

      <DialogFooter className="pb-6">
        <Button variant="contained" color="primary" onClick={onConfirm} fluid>
          Confirm
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
