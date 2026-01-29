import {
  Button,
  CheckIcon,
  CopyIcon,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Heading,
  ProviderAvatar,
  ResponsiveDialog,
  Text,
  useCopy,
} from "@babylonlabs-io/core-ui";

import { truncateAddress } from "../../../utils/addressUtils";

import { useDepositReviewData } from "./useDepositReviewData";

interface CollateralDepositReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (feeRate: number) => void;
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
  const {
    amountBtc,
    amountUsd,
    btcFee,
    btcFeeUsd,
    feeRate,
    feeError,
    selectedProviders,
    isLoading,
  } = useDepositReviewData(amount, providers, open);

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

        {/* Deposit Amount */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Deposit Amount
          </Text>
          <div className="flex items-center gap-2">
            <Text variant="body1" className="font-medium">
              {amountBtc} BTC
            </Text>
            {amountUsd !== null && (
              <Text variant="body1" className="text-accent-secondary">
                $
                {amountUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                USD
              </Text>
            )}
          </div>
        </div>

        {/* Vault Providers */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            {selectedProviders.length === 1
              ? "Vault Provider"
              : "Vault Providers"}
          </Text>
          <div className="flex flex-col items-end gap-3">
            {isLoading.providers ? (
              <Text variant="body2" className="text-accent-secondary">
                Loading providers...
              </Text>
            ) : (
              selectedProviders.map((provider) => (
                <div key={provider.id} className="flex items-center gap-3">
                  <ProviderAvatar
                    name={provider.name}
                    size="tiny"
                    className="h-6 w-6"
                  />
                  <Text variant="body1">
                    {provider.name.startsWith("0x")
                      ? truncateAddress(provider.name)
                      : provider.name}
                  </Text>
                  {provider.name.startsWith("0x") && (
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(provider.id, provider.name)
                      }
                      className="cursor-pointer"
                      aria-label={`Copy ${provider.name} address`}
                    >
                      {isCopied(provider.id) ? (
                        <CheckIcon size={14} variant="success" />
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

        {/* Fees */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Fees
          </Text>
          <div className="flex flex-col items-end gap-1">
            {/* BTC Fee */}
            {isLoading.fee ? (
              <Text variant="body1" className="text-accent-secondary">
                Calculating BTC fee...
              </Text>
            ) : btcFee !== null ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <Text variant="body1">{btcFee.toFixed(8)} BTC</Text>
                  {btcFeeUsd !== null && (
                    <Text variant="body1" className="text-accent-secondary">
                      $
                      {btcFeeUsd.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  )}
                </div>
                {feeRate > 0 && (
                  <Text
                    variant="body2"
                    className="text-xs text-accent-secondary"
                  >
                    at {feeRate} sat/vB
                  </Text>
                )}
              </div>
            ) : (
              <Text variant="body1" className="text-error-main">
                {feeError ?? "Fee estimate unavailable"}
              </Text>
            )}
          </div>
        </div>

        <div className="border-divider border-t" />

        {/* Attention Section */}
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
        <Button
          variant="contained"
          color="primary"
          onClick={() => onConfirm(feeRate)}
          disabled={isLoading.fee || feeRate <= 0 || btcFee === null}
          fluid
        >
          Confirm
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
